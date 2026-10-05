import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  collectionDetailSchema,
  guestContentItemSchema,
  guestContextSchema,
  guestPageEditorSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { imageKey } from '../src/images/image-keys.js';
import { createApp } from '../src/create-app.js';
import type { ApiEnv } from '../src/config/env.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { GuestPageRepository } from '../src/guest-page/guest-page.repository.js';
import { CollectionImagesService } from '../src/images/collection-images.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { PurgeContentHandler } from '../src/worker/handlers/purge-content.handler.js';
import { loadWorkerEnv } from '../src/worker/worker-env.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys } from './support/storage.js';
import { bigBuffer, fixture, uploadCalls, uploadFile } from './support/uploads.js';

const coverKey = (collectionId: string, id: string, role: 'original' | 'thumbnail' | 'preview') =>
  imageKey(collectionId, 'COVER', id, role);

const MB = 1_000_000;
const UPLOAD_ENV = { UPLOAD_PART_SIZE_BYTES: '5242880' };
const env = testEnv(UPLOAD_ENV);
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const workerEnv = loadWorkerEnv({
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  S3_ENDPOINT: env.S3_ENDPOINT,
  S3_REGION: env.S3_REGION,
  S3_BUCKET: env.S3_BUCKET,
  S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: 'true',
});

async function startApp(apiEnv: ApiEnv) {
  const app = await createApp(apiEnv);
  await listenOnLoopback(app);
  return { app, server: app.getHttpServer() as Server, tokens: app.get(GuestLinkTokens) };
}

type Started = Awaited<ReturnType<typeof startApp>>;
let s: Started;

/** A signed-in owner, their collection, a guest in it and the draft cover routes as the owner. */
async function owner(started: Started = s) {
  const admin = await signInAs(started.app, prisma, `owner-${randomUUID()}@example.com`);
  const seeded = await seedCollection(prisma, started.tokens, { ownerId: admin.userId });
  const guestCookie = await joinAsGuest(started.server, seeded.collectionId, seeded.link.token);
  const base = `/api/v1/collections/${seeded.collectionId}/guest-page/draft/cover`;
  return {
    ...admin,
    ...seeded,
    guest: uploadCalls(started.server, seeded.collectionId, guestCookie),
    guestCookie,
    fromFrame: (contentItemId: string, cookie = admin.cookie, path = base) =>
      request(started.server)
        .post(`${path}/from-frame`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ contentItemId }),
    remove: (cookie = admin.cookie, path = base) =>
      request(started.server).delete(path).set('Cookie', cookie).set('Origin', ORIGIN),
    detail: () =>
      request(started.server)
        .get(`/api/v1/collections/${seeded.collectionId}`)
        .set('Cookie', admin.cookie),
  };
}

type Owner = Awaited<ReturnType<typeof owner>>;

/** A guest photo frame, completed (PENDING until the worker runs). */
async function frame(o: Owner, name = 'IMG_0001.jpg', bytes: Buffer = fixture('photo.jpg')) {
  const session = await uploadFile(o.guest, name, bytes);
  return guestContentItemSchema.parse((await o.guest.complete(session.uploadId).expect(200)).body);
}

const coverRows = (collectionId: string) =>
  prisma.collectionImage.findMany({ where: { collectionId, slot: 'COVER' } });
const coverPrefixKeys = (collectionId: string) =>
  allKeys(storage, `collections/${collectionId}/cover/`);

describe('draft cover from a frame and its removal [A8][D1]', () => {
  beforeAll(async () => {
    s = await startApp(env);
  });

  afterAll(async () => {
    await s.app.close();
    storage.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('a completed photo frame becomes the cover: a copied original, the frame untouched', async () => {
    const o = await owner();
    const photo = fixture('photo.jpg');
    const item = await frame(o, 'IMG_0001.jpg', photo);
    const res = await o.fromFrame(item.id).expect(200);
    const editor = guestPageEditorSchema.parse(res.body);
    expect(editor.draft?.cover).toMatchObject({ status: 'PENDING', thumbnailUrl: null });
    // Only the draft has it [D1].
    expect(editor.published.cover).toBeNull();

    const rows = await coverRows(o.collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'FRAME',
      mimeType: 'image/jpeg',
      originalSizeBytes: BigInt(photo.length),
      status: 'PENDING',
    });
    const coverId = rows[0]?.id ?? '';
    expect(await storage.head(coverKey(o.collectionId, coverId, 'original'))).toEqual({
      size: photo.length,
      contentType: 'image/jpeg',
    });
    expect((await queuedJobs(prisma, 'media.collection-image')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: coverId },
    ]);
    // The frame's own row and object are as they were.
    const original = await prisma.mediaObject.findFirstOrThrow({
      where: { contentItemId: item.id, role: 'ORIGINAL' },
    });
    expect((await storage.head(original.storageKey))?.size).toBe(photo.length);
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt,
    ).toBeNull();
    // Nothing in the answer names the frame.
    expect(JSON.stringify(editor)).not.toContain(item.id);
  });

  test('Review Focus 1: the source frame is deleted and purged; the cover stays whole', async () => {
    const o = await owner();
    const item = await frame(o);
    await o.fromFrame(item.id).expect(200);
    const [cover] = await coverRows(o.collectionId);
    const original = await prisma.mediaObject.findFirstOrThrow({
      where: { contentItemId: item.id, role: 'ORIGINAL' },
    });

    await request(s.server)
      .delete(`/api/v1/content/${item.id}`)
      .set('Cookie', o.cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    await new PurgeContentHandler(prisma, storage, workerEnv).handle({ contentItemId: item.id });

    expect(await storage.head(original.storageKey)).toBeNull();
    expect(await prisma.contentItem.count({ where: { id: item.id } })).toBe(0);
    expect(await coverRows(o.collectionId)).toHaveLength(1);
    expect(
      await storage.head(coverKey(o.collectionId, cover?.id ?? '', 'original')),
    ).not.toBeNull();
    const page = await request(s.server)
      .get(`/api/v1/collections/${o.collectionId}/guest-page`)
      .set('Cookie', o.cookie)
      .expect(200);
    expect(page.body).toMatchObject({ draft: { cover: { status: 'PENDING' } } });
  });

  test('not a usable source: a text → 422, a FAILED photo → 422, a deleted frame → 404', async () => {
    const o = await owner();
    const text = await prisma.contentItem.create({
      data: {
        collectionId: o.collectionId,
        frameNo: 900,
        kind: 'TEXT',
        textBody: 'Вітаємо!',
        processingStatus: 'NOT_REQUIRED',
      },
    });
    const invalid = await o.fromFrame(text.id).expect(422);
    expect(invalid.body).toMatchObject({ code: 'COVER_SOURCE_INVALID' });

    const failed = await frame(o, 'broken.jpg');
    await prisma.contentItem.update({
      where: { id: failed.id },
      data: { processingStatus: 'FAILED' },
    });
    await o.fromFrame(failed.id).expect(422);

    const deleted = await frame(o, 'gone.jpg');
    await prisma.contentItem.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await o.fromFrame(deleted.id).expect(404);
    await o.fromFrame(randomUUID()).expect(404);
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(o.collectionId)).toEqual([]);
  });

  test("Review Focus 3: another owner's frame or collection → 404, nothing copied", async () => {
    const a = await owner();
    const b = await owner();
    const bFrame = await frame(b);
    // A names B's real frame under A's own collection.
    const res = await a.fromFrame(bFrame.id).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    // A calls B's collection with B's frame, and removes B's cover.
    const bBase = `/api/v1/collections/${b.collectionId}/guest-page/draft/cover`;
    await a.fromFrame(bFrame.id, a.cookie, bBase).expect(404);
    await a.remove(a.cookie, bBase).expect(404);
    // A guest's cookie on the admin routes.
    const asGuest = await a.fromFrame(bFrame.id, b.guestCookie).expect(401);
    expect(asGuest.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await coverRows(a.collectionId)).toEqual([]);
    expect(await coverRows(b.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(a.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(b.collectionId)).toEqual([]);
  });

  test('a frame deleted while its original was copied → 404, nothing recorded or left', async () => {
    const o = await owner();
    const item = await frame(o);
    const shared = s.app.get<ObjectStorage>(OBJECT_STORAGE);
    Object.assign(shared, {
      copyObject: async (from: string, to: string, type: string) => {
        await S3ObjectStorage.prototype.copyObject.call(shared, from, to, type);
        await prisma.contentItem.update({
          where: { id: item.id },
          data: { deletedAt: new Date() },
        });
      },
    });
    try {
      const res = await o.fromFrame(item.id).expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      delete (shared as { copyObject?: unknown }).copyObject;
    }
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(o.collectionId)).toEqual([]);
  });

  test('a frame whose original is already purged from storage → 404, not 503', async () => {
    const o = await owner();
    const item = await frame(o);
    const original = await prisma.mediaObject.findFirstOrThrow({
      where: { contentItemId: item.id, role: 'ORIGINAL' },
    });
    await storage.delete(original.storageKey);
    const res = await o.fromFrame(item.id).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(o.collectionId)).toEqual([]);
  });

  test('replacing a FRAME cover with another frame: one row, the old id queued for purge', async () => {
    const o = await owner();
    const first = await frame(o, 'a.jpg');
    const second = await frame(o, 'b.png', fixture('photo.png'));
    await o.fromFrame(first.id).expect(200);
    const [old] = await coverRows(o.collectionId);
    await o.fromFrame(second.id).expect(200);
    const rows = await coverRows(o.collectionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'FRAME', mimeType: 'image/png' });
    expect(rows[0]?.id).not.toBe(old?.id);
    expect((await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: old?.id, slot: 'COVER' },
    ]);
  });

  test('remove: 200, the draft lets go, the row goes, a purge is queued; again 200; guests never saw it', async () => {
    const o = await owner();
    const item = await frame(o);
    await o.fromFrame(item.id).expect(200);
    const [cover] = await coverRows(o.collectionId);
    // As the worker would leave it.
    await prisma.collectionImage.update({
      where: { id: cover?.id ?? '' },
      data: { status: 'READY', width: 320, height: 240, derivedSizeBytes: 500n },
    });
    const context = () =>
      request(s.server)
        .get(`/api/v1/guest/collections/${o.collectionId}/context`)
        .set('Cookie', o.guestCookie);
    // A draft cover, READY: guests still see the published page, with no cover [D1].
    expect(guestContextSchema.parse((await context().expect(200)).body).page.cover).toBeNull();

    const removed = await o.remove().expect(200);
    expect(guestPageEditorSchema.parse(removed.body).draft?.cover).toBeNull();
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect((await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: cover?.id, slot: 'COVER' },
    ]);
    expect((await o.detail().expect(200)).body).toMatchObject({ cover: null });
    await o.remove().expect(200);
    expect(await queuedJobs(prisma, 'collection-image.purge')).toHaveLength(1);
  });

  test('archived: from-frame and remove → 409 COLLECTION_ARCHIVED, nothing changes', async () => {
    const o = await owner();
    const item = await frame(o);
    await o.fromFrame(item.id).expect(200);
    await prisma.collection.update({
      where: { id: o.collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const refused = await o.fromFrame(item.id).expect(409);
    expect(refused.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    const kept = await o.remove().expect(409);
    expect(kept.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    expect(await coverRows(o.collectionId)).toHaveLength(1);
    expect(await coverPrefixKeys(o.collectionId)).toHaveLength(1);
  });

  test('garbage collection keeps an image any version still references', async () => {
    const o = await owner();
    await o.fromFrame((await frame(o, 'a.jpg')).id).expect(200);
    const [a] = await coverRows(o.collectionId);
    const images = s.app.get(CollectionImagesService);
    const pages = s.app.get(GuestPageRepository);
    // The published version references A too (as a publish of the draft leaves it).
    await prisma.$transaction((tx) =>
      pages.setImageRef(tx, o.collectionId, 'PUBLISHED', 'COVER', a?.id ?? null),
    );
    // The published version lets go of A; the draft keeps it.
    await prisma.$transaction(async (tx) => {
      await pages.setImageRef(tx, o.collectionId, 'PUBLISHED', 'COVER', null);
      await images.collectGarbage(tx, o.collectionId, [a?.id ?? null]);
    });
    expect(await coverRows(o.collectionId)).toHaveLength(1);
    expect(await queuedJobs(prisma, 'collection-image.purge')).toEqual([]);
    // Then the draft lets go too: now it goes.
    await prisma.$transaction(async (tx) => {
      await pages.setImageRef(tx, o.collectionId, 'DRAFT', 'COVER', null);
      await images.collectGarbage(tx, o.collectionId, [a?.id ?? null]);
    });
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect((await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: a?.id, slot: 'COVER' },
    ]);
  });
});

describe('cover from a frame: quota (Review Focus 4)', () => {
  let q: Started;

  beforeAll(async () => {
    q = await startApp(
      testEnv({ ...UPLOAD_ENV, LIMIT_STORAGE_BYTES_PER_COLLECTION: String(10 * MB) }),
    );
  });

  afterAll(async () => {
    await q.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('the frame’s bytes must fit a second time; removing the cover frees them at once', async () => {
    const o = await owner(q);
    const header = fixture('photo.jpg').subarray(0, 4096);
    const big = await frame(o, 'big.jpg', bigBuffer(6 * MB, header));
    const refused = await o.fromFrame(big.id).expect(409);
    expect(refused.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await coverRows(o.collectionId)).toEqual([]);
    expect(await coverPrefixKeys(o.collectionId)).toEqual([]);

    // Without the 6 MB frame, a 4 MB frame and its 4 MB cover copy fit: 8 MB used.
    await request(q.server)
      .delete(`/api/v1/content/${big.id}`)
      .set('Cookie', o.cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    const small = await frame(o, 'small.jpg', bigBuffer(4 * MB, header));
    await o.fromFrame(small.id).expect(200);
    const detail = collectionDetailSchema.parse((await o.detail().expect(200)).body);
    expect(detail.storage.usedBytes).toBe(8 * MB);
    // 8 MB used: a 3 MB guest upload does not fit; once the cover is removed it does.
    await o.guest.initiate({ filename: 'c.jpg', sizeBytes: 3 * MB }).expect(409);
    await o.remove().expect(200);
    expect(
      collectionDetailSchema.parse((await o.detail().expect(200)).body).storage.usedBytes,
    ).toBe(4 * MB);
    await o.guest.initiate({ filename: 'c.jpg', sizeBytes: 3 * MB }).expect(201);
  });
});
