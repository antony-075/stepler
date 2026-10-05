import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { guestContentItemSchema, guestPageEditorSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { imageKey } from '../src/images/image-keys.js';
import { createApp } from '../src/create-app.js';
import type { ApiEnv } from '../src/config/env.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { ExpireUploadsHandler } from '../src/worker/handlers/expire-uploads.handler.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys } from './support/storage.js';
import {
  asSession,
  bigBuffer,
  draftImageUploadCalls,
  fixture,
  putTo,
  uploadCalls,
  uploadFile,
} from './support/uploads.js';

const coverKey = (collectionId: string, id: string, role: 'original' | 'thumbnail' | 'preview') =>
  imageKey(collectionId, 'COVER', id, role);

const MB = 1_000_000;
const UPLOAD_ENV = { UPLOAD_PART_SIZE_BYTES: '5242880' };
const env = testEnv({ ...UPLOAD_ENV, LOG_LEVEL: 'info' });
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);

class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

async function startApp(apiEnv: ApiEnv, logs?: CaptureStream) {
  const app = await createApp(apiEnv, logs === undefined ? {} : { logDestination: logs });
  await listenOnLoopback(app);
  return { app, server: app.getHttpServer() as Server, tokens: app.get(GuestLinkTokens) };
}

let app: INestApplication;
let server: Server;
let tokens: GuestLinkTokens;
const logs = new CaptureStream();

/** A signed-in owner, their collection and the guest page draft's cover upload routes as them. */
async function owner(s: Server = server, a: INestApplication = app, t: GuestLinkTokens = tokens) {
  const admin = await signInAs(a, prisma, `owner-${randomUUID()}@example.com`);
  const seeded = await seedCollection(prisma, t, { ownerId: admin.userId });
  return { ...admin, ...seeded, calls: coverCalls(s, seeded.collectionId, admin.cookie) };
}

/** The draft cover's upload routes (the only cover upload since the slice 8a routes went). */
const coverCalls = (s: Server, collectionId: string, cookie: string) =>
  draftImageUploadCalls(s, collectionId, cookie, 'cover');

const coverRows = (collectionId: string) =>
  prisma.collectionImage.findMany({ where: { collectionId, slot: 'COVER' } });
const uploadRow = (id: string) => prisma.uploadSession.findUniqueOrThrow({ where: { id } });
const coverJobs = () => queuedJobs(prisma, 'media.collection-image');

describe('admin cover upload [A1]', () => {
  beforeAll(async () => {
    ({ app, server, tokens } = await startApp(env, logs));
    await boss.start();
  });

  afterAll(async () => {
    await app.close();
    await boss.stop();
    storage.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    logs.output = '';
  });

  test('photo.jpg: initiate → parts → PUT → complete makes a PENDING cover from a copied original', async () => {
    const o = await owner();
    const photo = fixture('photo.jpg');
    const session = await uploadFile(o.calls, 'IMG_0001.jpg', photo);
    expect(session.partCount).toBe(1);

    const res = await o.calls.complete(session.uploadId).expect(200);
    const editor = guestPageEditorSchema.parse(res.body);
    // The draft gets the cover; guests (the published version) do not see it until a publish.
    expect(editor.published.cover).toBeNull();
    const { id: imageId, ...draftCover } = editor.draft?.cover ?? { id: '' };
    expect(imageId).not.toBe('');
    expect(draftCover).toEqual({
      status: 'PENDING',
      thumbnailUrl: null,
      previewUrl: null,
      largeUrl: null,
      width: null,
      height: null,
    });
    const rows = await coverRows(o.collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'UPLOAD',
      mimeType: 'image/jpeg',
      originalSizeBytes: BigInt(photo.length),
      derivedSizeBytes: 0n,
      status: 'PENDING',
    });
    const coverId = rows[0]?.id ?? '';
    expect((await coverJobs()).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: coverId },
    ]);
    const original = await storage.head(coverKey(o.collectionId, coverId, 'original'));
    expect(original).toEqual({ size: photo.length, contentType: 'image/jpeg' });
    const row = await uploadRow(session.uploadId);
    expect(row).toMatchObject({
      status: 'COMPLETED',
      purpose: 'COVER',
      uploaderUserId: o.userId,
      contentItemId: null,
      guestSessionId: null,
    });
    // The upload's own key is gone; no content frame was created.
    expect(await storage.head(row.storageKey)).toBeNull();
    expect(await prisma.contentItem.count()).toBe(0);
    // The editor state shows the pending cover in the draft; the collection's cover (the
    // published one) stays empty.
    const page = await request(server)
      .get(`/api/v1/collections/${o.collectionId}/guest-page`)
      .set('Cookie', o.cookie)
      .expect(200);
    expect(page.body).toMatchObject({ draft: { cover: { status: 'PENDING' } } });
    const detail = await request(server)
      .get(`/api/v1/collections/${o.collectionId}`)
      .set('Cookie', o.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ cover: null });
  });

  test('a HEIC with no declared type is accepted as image/heic; completion is idempotent', async () => {
    const o = await owner();
    const heic = fixture('photo.heic');
    const session = await uploadFile(o.calls, 'IMG_0002.heic', heic);
    const results = await Promise.all([
      o.calls.complete(session.uploadId),
      o.calls.complete(session.uploadId),
    ]);
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ code: 'UPLOAD_IN_PROGRESS', retryable: true });
    }
    const rows = await coverRows(o.collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mimeType: 'image/heic', source: 'UPLOAD' });
    const coverId = rows[0]?.id ?? '';

    // Again afterwards: 200, the same single row and object, no second copy.
    await o.calls.complete(session.uploadId).expect(200);
    expect(await coverRows(o.collectionId)).toHaveLength(1);
    expect(await allKeys(storage, `collections/${o.collectionId}/cover/`)).toEqual([
      coverKey(o.collectionId, coverId, 'original'),
    ]);
    expect(await coverJobs()).toHaveLength(1);
  });

  test('refused at initiation: videos, documents, oversized photos; disallowed names', async () => {
    const o = await owner();
    for (const filename of ['clip.mp4', 'doc.pdf', 'page.html', 'image.svg']) {
      const res = await o.calls.initiate({ filename, sizeBytes: 100 }).expect(422);
      expect(res.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    }
    const big = await o.calls.initiate({ filename: 'big.jpg', sizeBytes: 60 * MB }).expect(422);
    expect(big.body).toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(await prisma.uploadSession.count()).toBe(0);
  });

  test('content that is not a photo: 422 at completion, REJECTED, discard queued, no cover', async () => {
    const o = await owner();
    const session = await uploadFile(o.calls, 'holiday.jpg', fixture('fake.jpg'));
    const res = await o.calls.complete(session.uploadId).expect(422);
    expect(res.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect(await uploadRow(session.uploadId)).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'FILE_TYPE_NOT_ALLOWED',
    });
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect((await queuedJobs(prisma, 'storage.discard-upload')).map((job) => job.data)).toEqual([
      { uploadSessionId: session.uploadId },
    ]);
    expect(await allKeys(storage, `collections/${o.collectionId}/cover/`)).toEqual([]);
    await o.calls.complete(session.uploadId).expect(409);
  });

  test('a second upload replaces the cover: the old row goes, its prefix is queued for purge', async () => {
    const o = await owner();
    const first = await uploadFile(o.calls, 'a.jpg', fixture('photo.jpg'));
    await o.calls.complete(first.uploadId).expect(200);
    const [old] = await coverRows(o.collectionId);
    const second = await uploadFile(o.calls, 'b.png', fixture('photo.png'));
    const res = await o.calls.complete(second.uploadId).expect(200);
    expect(res.body).toMatchObject({ draft: { cover: { status: 'PENDING' } } });
    const rows = await coverRows(o.collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(old?.id);
    expect(rows[0]).toMatchObject({ mimeType: 'image/png', status: 'PENDING' });
    expect((await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: old?.id, slot: 'COVER' },
    ]);
    // Both derivative jobs exist (the old one finds no row and cleans up after itself).
    expect(await coverJobs()).toHaveLength(2);
  });

  test('a 4th open cover upload → 429; cancel → 204, ABORTED, discard; the expiry job expires a stale one', async () => {
    const o = await owner();
    const open: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await o.calls.initiate({ filename: `${i}.jpg`, sizeBytes: 100 }).expect(201);
      open.push(asSession(res.body).uploadId);
    }
    const limited = await o.calls.initiate({ filename: 'x.jpg', sizeBytes: 100 }).expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });

    await o.calls.cancel(open[0] ?? '').expect(204);
    expect((await uploadRow(open[0] ?? '')).status).toBe('ABORTED');
    expect(await queuedJobs(prisma, 'storage.discard-upload')).toHaveLength(1);
    await o.calls.cancel(open[0] ?? '').expect(204);
    await o.calls.parts(open[0] ?? '', [1]).expect(409);
    // Room again.
    await o.calls.initiate({ filename: 'x.jpg', sizeBytes: 100 }).expect(201);

    await prisma.uploadSession.update({
      where: { id: open[1] ?? '' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await new ExpireUploadsHandler(prisma, queue).handle();
    expect((await uploadRow(open[1] ?? '')).status).toBe('EXPIRED');
    expect((await uploadRow(open[2] ?? '')).status).toBe('INITIATED');
    const expired = await o.calls.complete(open[1] ?? '').expect(410);
    expect(expired.body).toMatchObject({ code: 'UPLOAD_EXPIRED' });
  });

  test('retries: the same clientUploadId replays the open upload; another file conflicts', async () => {
    const o = await owner();
    const photo = fixture('photo.jpg');
    const clientUploadId = randomUUID();
    const first = asSession(
      (
        await o.calls
          .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
          .expect(201)
      ).body,
    );
    const again = asSession(
      (
        await o.calls
          .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
          .expect(201)
      ).body,
    );
    expect(again.uploadId).toBe(first.uploadId);
    await o.calls
      .initiate({ filename: 'a.jpg', sizeBytes: photo.length + 1, clientUploadId })
      .expect(409);
    // The same id for another collection of the same owner: a conflict, not a replay.
    const other = await seedCollection(prisma, tokens, { ownerId: o.userId });
    const otherCalls = coverCalls(server, other.collectionId, o.cookie);
    const conflict = await otherCalls
      .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await prisma.uploadSession.count()).toBe(1);
  });

  test('completing before any byte arrived: 409 UPLOAD_INCOMPLETE, the upload stays open', async () => {
    const o = await owner();
    const session = asSession(
      (await o.calls.initiate({ filename: 'a.jpg', sizeBytes: 100 }).expect(201)).body,
    );
    const res = await o.calls.complete(session.uploadId).expect(409);
    expect(res.body).toMatchObject({ code: 'UPLOAD_INCOMPLETE', missingPartNumbers: [1] });
    expect((await uploadRow(session.uploadId)).status).toBe('INITIATED');
    expect(await coverRows(o.collectionId)).toEqual([]);
  });

  test('archived: initiate → 409; archived between PUT and complete → 409, REJECTED, discard', async () => {
    const o = await owner();
    const session = await uploadFile(o.calls, 'a.jpg', fixture('photo.jpg'));
    const open = asSession(
      (await o.calls.initiate({ filename: 'c.jpg', sizeBytes: 100 }).expect(201)).body,
    );
    await prisma.collection.update({
      where: { id: o.collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const refused = await o.calls.initiate({ filename: 'b.jpg', sizeBytes: 100 }).expect(409);
    expect(refused.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    const res = await o.calls.complete(session.uploadId).expect(409);
    expect(res.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    expect(await uploadRow(session.uploadId)).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'COLLECTION_ARCHIVED',
    });
    expect((await queuedJobs(prisma, 'storage.discard-upload')).map((job) => job.data)).toEqual([
      { uploadSessionId: session.uploadId },
    ]);
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await allKeys(storage, `collections/${o.collectionId}/cover/`)).toEqual([]);
    // Cancelling still works while archived (it only frees things).
    await o.calls.cancel(open.uploadId).expect(204);
    expect((await uploadRow(open.uploadId)).status).toBe('ABORTED');
  });

  test('archived: a replay of an open upload and its part URLs → 409; cancel still works', async () => {
    const o = await owner();
    const clientUploadId = randomUUID();
    const open = asSession(
      (await o.calls.initiate({ filename: 'a.jpg', sizeBytes: 100, clientUploadId }).expect(201))
        .body,
    );
    await prisma.collection.update({
      where: { id: o.collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const replay = await o.calls
      .initiate({ filename: 'a.jpg', sizeBytes: 100, clientUploadId })
      .expect(409);
    expect(replay.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    const parts = await o.calls.parts(open.uploadId, [1]).expect(409);
    expect(parts.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    expect(parts.text).not.toMatch(/X-Amz-|https?:\/\//);
    await o.calls.cancel(open.uploadId).expect(204);
  });

  test('a completion that lost its stale claim to another deletes its own copy', async () => {
    const o = await owner();
    const session = await uploadFile(o.calls, 'a.jpg', fixture('photo.jpg'));
    const shared = app.get<ObjectStorage>(OBJECT_STORAGE);
    const copied: string[] = [];
    // While this request copies, another completion takes the claim over and records first.
    Object.assign(shared, {
      copyObject: async (from: string, to: string, type: string) => {
        await S3ObjectStorage.prototype.copyObject.call(shared, from, to, type);
        copied.push(to);
        await prisma.uploadSession.update({
          where: { id: session.uploadId },
          data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: null },
        });
      },
    });
    try {
      await o.calls.complete(session.uploadId).expect(200);
    } finally {
      delete (shared as { copyObject?: unknown }).copyObject;
    }
    expect(copied).toHaveLength(1);
    expect(await storage.head(copied[0] ?? '')).toBeNull();
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await coverJobs()).toEqual([]);
  });

  test('a cover upload id on the guest routes, by a guest of the same collection → 404', async () => {
    const o = await owner();
    const session = asSession(
      (await o.calls.initiate({ filename: 'a.jpg', sizeBytes: 100 }).expect(201)).body,
    );
    const guestCookie = await joinAsGuest(server, o.collectionId, o.link.token);
    const guest = uploadCalls(server, o.collectionId, guestCookie);
    await guest.parts(session.uploadId, [1]).expect(404);
    await guest.complete(session.uploadId).expect(404);
    await guest.cancel(session.uploadId).expect(404);
    expect((await uploadRow(session.uploadId)).status).toBe('INITIATED');
  });

  describe('Review Focus 3: scope', () => {
    test("admin B gets 404 on every cover route of A's collection, with A's upload id too", async () => {
      const a = await owner();
      const session = asSession(
        (await a.calls.initiate({ filename: 'a.jpg', sizeBytes: 100 }).expect(201)).body,
      );
      const b = await signInAs(app, prisma, 'b@example.com');
      const bCalls = coverCalls(server, a.collectionId, b.cookie);
      for (const res of [
        await bCalls.initiate({ filename: 'b.jpg', sizeBytes: 100 }),
        await bCalls.parts(session.uploadId, [1]),
        await bCalls.complete(session.uploadId),
        await bCalls.cancel(session.uploadId),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
        expect(res.text).not.toMatch(/X-Amz-|https?:\/\//);
      }
      // A's upload id under B's own collection: 404 as well.
      const own = await seedCollection(prisma, tokens, { ownerId: b.userId });
      const ownCalls = coverCalls(server, own.collectionId, b.cookie);
      await ownCalls.parts(session.uploadId, [1]).expect(404);
      await ownCalls.complete(session.uploadId).expect(404);
      await ownCalls.cancel(session.uploadId).expect(404);
      expect(await prisma.uploadSession.count()).toBe(1);
      expect((await uploadRow(session.uploadId)).status).toBe('INITIATED');
    });

    test("a guest's upload id is never a cover upload: 404 for the owner too", async () => {
      const o = await owner();
      const guestCookie = await joinAsGuest(server, o.collectionId, o.link.token);
      const guest = uploadCalls(server, o.collectionId, guestCookie);
      const session = asSession(
        (await guest.initiate({ filename: 'g.jpg', sizeBytes: 100 }).expect(201)).body,
      );
      await o.calls.parts(session.uploadId, [1]).expect(404);
      await o.calls.complete(session.uploadId).expect(404);
      await o.calls.cancel(session.uploadId).expect(404);
    });

    test('a guest cookie without an admin session → 401 UNAUTHENTICATED', async () => {
      const o = await owner();
      const guestCookie = await joinAsGuest(server, o.collectionId, o.link.token);
      const asGuest = coverCalls(server, o.collectionId, guestCookie);
      for (const res of [
        await asGuest.initiate({ filename: 'a.jpg', sizeBytes: 100 }),
        await asGuest.parts(randomUUID(), [1]),
        await asGuest.complete(randomUUID()),
        await asGuest.cancel(randomUUID()),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      }
    });

    test('an unsafe call without the app origin → 403 CSRF_ORIGIN_MISMATCH', async () => {
      const o = await owner();
      const res = await request(server)
        .post(`/api/v1/collections/${o.collectionId}/guest-page/draft/cover/uploads`)
        .set('Cookie', o.cookie)
        .send({ clientUploadId: randomUUID(), filename: 'a.jpg', mimeType: '', sizeBytes: 10 })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    });

    test('no presigned URL, signature, cookie or file name in the logs of a whole cover upload', async () => {
      logs.output = '';
      const o = await owner();
      const session = await uploadFile(o.calls, 'Весілля Олі.jpg', fixture('photo.jpg'));
      await o.calls.complete(session.uploadId).expect(200);
      await o.calls.complete(randomUUID()).expect(404);
      expect(logs.output).toContain('image upload completed');
      expect(logs.output).toContain('image set');
      expect(logs.output).not.toMatch(/X-Amz-|https?:\/\/127\.0\.0\.1:\d+\/stepler-test/);
      expect(logs.output).not.toContain(o.cookie.split('=')[1] ?? 'never');
      expect(logs.output).not.toContain('Весілля Олі');
    });
  });

  test('part URLs die with the upload: after completion a part PUT cannot replace the original', async () => {
    const o = await owner();
    const photo = fixture('photo.jpg');
    const session = await uploadFile(o.calls, 'a.jpg', photo);
    await o.calls.complete(session.uploadId).expect(200);
    const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(photo.length));
    expect(await putTo(session.urls.get(1) ?? '', html)).toBeGreaterThanOrEqual(400);
    await o.calls.parts(session.uploadId, [1]).expect(409);
    const [cover] = await coverRows(o.collectionId);
    const head = await storage.readRange(
      coverKey(o.collectionId, cover?.id ?? '', 'original'),
      0,
      3,
    );
    expect([...head.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe('admin cover upload: quota (Review Focus 4)', () => {
  const quotaEnv = testEnv({ ...UPLOAD_ENV, LIMIT_STORAGE_BYTES_PER_COLLECTION: String(10 * MB) });
  let q: Awaited<ReturnType<typeof startApp>>;

  beforeAll(async () => {
    q = await startApp(quotaEnv);
  });

  afterAll(async () => {
    await q.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('a 6 MB cover and a 6 MB guest photo do not both fit in 10 MB; deleting the photo makes room', async () => {
    const o = await owner(q.server, q.app, q.tokens);
    const guestCookie = await joinAsGuest(q.server, o.collectionId, o.link.token);
    const guest = uploadCalls(q.server, o.collectionId, guestCookie);
    const photo = bigBuffer(6 * MB, fixture('photo.jpg').subarray(0, 4096));
    const session = await uploadFile(guest, 'big.jpg', photo);
    const item = guestContentItemSchema.parse(
      (await guest.complete(session.uploadId).expect(200)).body,
    );

    const refused = await o.calls
      .initiate({ filename: 'cover.jpg', sizeBytes: 6 * MB })
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await request(q.server)
      .delete(`/api/v1/content/${item.id}`)
      .set('Cookie', o.cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    const cover = await uploadFile(o.calls, 'cover.jpg', photo);
    await o.calls.complete(cover.uploadId).expect(200);
    // The cover now holds the space: a 6 MB guest photo is refused.
    const again = await guest.initiate({ filename: 'c.jpg', sizeBytes: 6 * MB }).expect(409);
    expect(again.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  test('a replaced cover never double-counts: its bytes are freed as the new one lands', async () => {
    const o = await owner(q.server, q.app, q.tokens);
    const photo = bigBuffer(6 * MB, fixture('photo.jpg').subarray(0, 4096));
    const first = await uploadFile(o.calls, 'a.jpg', photo);
    await o.calls.complete(first.uploadId).expect(200);
    // A second 6 MB cover: refused at initiation (the live cover still counts, 6 + 6 > 10) …
    await o.calls.initiate({ filename: 'b.jpg', sizeBytes: 6 * MB }).expect(409);
    // … but a 4 MB one fits, and after it lands only its bytes count.
    const small = bigBuffer(4 * MB, fixture('photo.jpg').subarray(0, 4096));
    const second = await uploadFile(o.calls, 'b.jpg', small);
    await o.calls.complete(second.uploadId).expect(200);
    const detail = await request(q.server)
      .get(`/api/v1/collections/${o.collectionId}`)
      .set('Cookie', o.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ storage: { usedBytes: 4 * MB } });
  });
});

describe('admin cover upload: rate limits', () => {
  test('per user and per IP: 429 RATE_LIMITED with Retry-After', async () => {
    await resetDatabase(prisma);
    const s = await startApp(
      testEnv({
        ...UPLOAD_ENV,
        LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE: '2',
        LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE: '3',
      }),
    );
    try {
      const a = await owner(s.server, s.app, s.tokens);
      await a.calls.initiate({ filename: '0.jpg', sizeBytes: 10 }).expect(201);
      await a.calls.initiate({ filename: '1.jpg', sizeBytes: 10 }).expect(201);
      const limited = await a.calls.initiate({ filename: '2.jpg', sizeBytes: 10 }).expect(429);
      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      // Another user on the same IP has their own budget, but the IP's (3) is spent.
      const b = await owner(s.server, s.app, s.tokens);
      await b.calls.initiate({ filename: 'b.jpg', sizeBytes: 10 }).expect(429);
    } finally {
      await s.app.close();
    }
  });
});
