import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  collectionDetailSchema,
  collectionListResponseSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AppError } from '../src/errors/app-error.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { LimitsService } from '../src/limits/limits.service.js';
import { UsageService } from '../src/limits/usage.service.js';
import { resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

const MB = 1_000_000n;
const env = testEnv({
  LIMIT_STORAGE_BYTES_PER_COLLECTION: String(10n * MB),
  LIMIT_STORAGE_BYTES_PER_ACCOUNT: String(15n * MB),
});
const prisma = new PrismaService(env);
const usage = new UsageService(prisma, new LimitsService(env));

let app: INestApplication;
let server: Server;
let tokens: GuestLinkTokens;
let frame = 0;

async function seed(ownerId?: string) {
  const seeded = await seedCollection(prisma, tokens, ownerId === undefined ? {} : { ownerId });
  const session = await prisma.guestSession.create({
    data: {
      collectionId: seeded.collectionId,
      currentLinkId: seeded.link.id,
      tokenHash: randomUUID(),
    },
  });
  return { ...seeded, sessionId: session.id };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

function reservation(
  s: Seeded,
  bytes: bigint,
  status: 'INITIATED' | 'EXPIRED' | 'REJECTED' | 'ABORTED' = 'INITIATED',
  tx: Pick<PrismaService, 'uploadSession'> = prisma,
) {
  const id = randomUUID();
  return tx.uploadSession.create({
    data: {
      collectionId: s.collectionId,
      guestSessionId: s.sessionId,
      guestLinkId: s.link.id,
      clientUploadId: randomUUID(),
      kind: 'PHOTO',
      originalFilename: 'IMG_1.jpg',
      declaredMime: 'image/jpeg',
      declaredSizeBytes: bytes,
      storageKey: `collections/${s.collectionId}/uploads/${id}/original`,
      multipartUploadId: 'mp',
      partSizeBytes: 10_485_760n,
      partCount: 1,
      status,
      ...(status === 'REJECTED' ? { rejectReason: 'FILE_TYPE_NOT_ALLOWED' } : {}),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
}

/** A photo item with its stored files. */
async function photo(
  s: Seeded,
  files: { role: 'ORIGINAL' | 'THUMBNAIL' | 'PREVIEW'; bytes: bigint }[],
  deleted = false,
) {
  const item = await prisma.contentItem.create({
    data: {
      collectionId: s.collectionId,
      frameNo: ++frame,
      kind: 'PHOTO',
      processingStatus: 'PENDING',
      ...(deleted ? { deletedAt: new Date() } : {}),
    },
  });
  for (const file of files) {
    await prisma.mediaObject.create({
      data: {
        contentItemId: item.id,
        role: file.role,
        storageKey: `collections/${s.collectionId}/derived/${item.id}/${file.role}`,
        mimeType: 'image/jpeg',
        sizeBytes: file.bytes,
      },
    });
  }
  return item;
}

describe('storage usage and quotas', () => {
  beforeAll(async () => {
    app = await createApp(env);
    await app.init();
    server = app.getHttpServer() as Server;
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('collection usage: files of live items plus open uploads; nothing else', async () => {
    const s = await seed();
    await photo(s, [
      { role: 'ORIGINAL', bytes: 3n * MB },
      { role: 'THUMBNAIL', bytes: 1000n },
    ]);
    await photo(s, [{ role: 'ORIGINAL', bytes: 4n * MB }], true);
    await reservation(s, 2n * MB);
    await reservation(s, 5n * MB, 'EXPIRED');
    await reservation(s, 5n * MB, 'REJECTED');
    await reservation(s, 5n * MB, 'ABORTED');
    expect(await usage.collectionStorageBytes(prisma, s.collectionId)).toBe(5n * MB + 1000n);
  });

  test('account usage sums its collections but not those being deleted', async () => {
    const a = await seed();
    const b = await seed(a.ownerId);
    const other = await seed();
    await photo(a, [{ role: 'ORIGINAL', bytes: 1n * MB }]);
    await reservation(b, 2n * MB);
    await photo(other, [{ role: 'ORIGINAL', bytes: 7n * MB }]);
    expect(await usage.accountStorageBytes(prisma, a.ownerId)).toBe(3n * MB);
    await prisma.collection.update({
      where: { id: b.collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    expect(await usage.accountStorageBytes(prisma, a.ownerId)).toBe(1n * MB);
  });

  /** One reservation attempt as the upload initiation will make it. */
  const reserve = (s: Seeded, bytes: bigint) =>
    prisma.$transaction(async (tx) => {
      await usage.lockOwner(tx, s.ownerId);
      await usage.assertCanReserve(tx, {
        userId: s.ownerId,
        collectionId: s.collectionId,
        bytes,
      });
      await reservation(s, bytes, 'INITIATED', tx);
    });

  test('two concurrent 6 MB reservations against 10 MB: exactly one succeeds', async () => {
    const s = await seed();
    const results = await Promise.allSettled([reserve(s, 6n * MB), reserve(s, 6n * MB)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(AppError);
    expect(rejected?.reason).toMatchObject({ code: 'QUOTA_EXCEEDED', status: 409 });
    expect(await prisma.uploadSession.count()).toBe(1);
  });

  test('the account limit holds across two collections of one owner', async () => {
    const a = await seed();
    const b = await seed(a.ownerId);
    await photo(a, [{ role: 'ORIGINAL', bytes: 5n * MB }]);
    const results = await Promise.allSettled([reserve(a, 5n * MB), reserve(b, 5n * MB)]);
    // 5 used + 5 + 5 = 15: both fit the account (15 MB) and their collections.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    await expect(reserve(b, 1n)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  test('cover bytes (original and derivatives) count toward the collection and the account', async () => {
    const s = await seed();
    await prisma.collectionCover.create({
      data: {
        collectionId: s.collectionId,
        status: 'READY',
        source: 'FRAME',
        mimeType: 'image/jpeg',
        originalSizeBytes: 6n * MB,
        derivedSizeBytes: 1000n,
        width: 100,
        height: 100,
      },
    });
    expect(await usage.collectionStorageBytes(prisma, s.collectionId)).toBe(6n * MB + 1000n);
    expect(await usage.accountStorageBytes(prisma, s.ownerId)).toBe(6n * MB + 1000n);
    await expect(reserve(s, 6n * MB)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    // Removing the cover (its row) frees the bytes at once, before the purge runs.
    await prisma.collectionCover.deleteMany({ where: { collectionId: s.collectionId } });
    await reserve(s, 6n * MB);
  });

  test('a deleted item frees its space at once', async () => {
    const s = await seed();
    const item = await photo(s, [{ role: 'ORIGINAL', bytes: 6n * MB }]);
    await expect(reserve(s, 6n * MB)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await prisma.contentItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    await reserve(s, 6n * MB);
  });

  test('/me/usage and the collection detail report storage', async () => {
    const owner = await signInAs(app, prisma, 'olena@example.com');
    const s = await seed(owner.userId);
    await photo(s, [
      { role: 'ORIGINAL', bytes: 2n * MB },
      { role: 'THUMBNAIL', bytes: 1234n },
    ]);
    await photo(s, [{ role: 'ORIGINAL', bytes: 4n * MB }], true);
    await prisma.collectionCover.create({
      data: {
        collectionId: s.collectionId,
        source: 'UPLOAD',
        mimeType: 'image/jpeg',
        originalSizeBytes: 1_000_000n,
      },
    });

    const me = await request(server).get('/api/v1/me/usage').set('Cookie', owner.cookie);
    expect(me.status).toBe(200);
    expect(usageResponseSchema.parse(me.body).storage).toEqual({
      usedBytes: 3_001_234,
      limitBytes: 15_000_000,
    });

    const detail = await request(server)
      .get(`/api/v1/collections/${s.collectionId}`)
      .set('Cookie', owner.cookie);
    expect(detail.status).toBe(200);
    expect(collectionDetailSchema.parse(detail.body).storage).toEqual({
      usedBytes: 3_001_234,
      limitBytes: 10_000_000,
    });

    const list = await request(server).get('/api/v1/collections').set('Cookie', owner.cookie);
    expect(collectionListResponseSchema.parse(list.body).items[0]).not.toHaveProperty('storage');
  });
});
