import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { adminContentDetailSchema, guestContentItemSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { ApiEnv } from '../src/config/env.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { DiscardUploadHandler } from '../src/worker/handlers/discard-upload.handler.js';
import { ExpireUploadsHandler } from '../src/worker/handlers/expire-uploads.handler.js';
import { PurgeCollectionHandler } from '../src/worker/handlers/purge-collection.handler.js';
import { PurgeContentHandler } from '../src/worker/handlers/purge-content.handler.js';
import { loadWorkerEnv } from '../src/worker/worker-env.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv, WORKER_MAIL_ENV } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { useTestPlanLimits } from './support/billing.js';
import {
  asSession,
  bigBuffer,
  fixture,
  partUrls,
  putTo,
  uploadCalls,
  uploadFile,
} from './support/uploads.js';

const MIB = 1_048_576;
const UPLOAD_ENV = { UPLOAD_PART_SIZE_BYTES: '5242880' };
const env = testEnv(UPLOAD_ENV);
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);
const workerEnv = loadWorkerEnv({
  ...WORKER_MAIL_ENV,
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

let app: INestApplication;
let server: Server;
let tokens: GuestLinkTokens;

/** A collection with its default link, and one guest in it. */
async function guest(options: { ownerId?: string } = {}) {
  const seeded = await seedCollection(prisma, tokens, options);
  const cookie = await joinAsGuest(server, seeded.collectionId, seeded.link.token);
  return { ...seeded, cookie, calls: uploadCalls(server, seeded.collectionId, cookie) };
}

const mp4Header = () => fixture('clip.mp4').subarray(0, 4096);

describe('uploads API', () => {
  beforeAll(async () => {
    ({ app, server, tokens } = await startApp(env));
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
  });

  test('a small file is one part: initiate → sign → PUT → complete', async () => {
    const g = await guest();
    const photo = fixture('photo.jpg');
    const session = await uploadFile(g.calls, 'IMG_0001.jpg', photo);
    expect(session.partCount).toBe(1);

    const res = await g.calls.complete(session.uploadId).expect(200);
    const item = guestContentItemSchema.parse(res.body);
    expect(item).toMatchObject({
      kind: 'PHOTO',
      frameNo: 1,
      isOwn: true,
      processingStatus: 'PENDING',
      originalFilename: 'IMG_0001.jpg',
      sizeBytes: photo.length,
    });
    const media = await prisma.mediaObject.findMany({ where: { contentItemId: item.id } });
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      role: 'ORIGINAL',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(photo.length),
    });
    const jobs = await queuedJobs(prisma, 'media.image-derivatives');
    expect(jobs.map((job) => job.data)).toEqual([{ contentItemId: item.id }]);
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'COMPLETED', contentItemId: item.id });
  });

  test('the admin gets view and download links; the download is an attachment', async () => {
    const owner = await signInAs(app, prisma, 'olena@example.com');
    const g = await guest({ ownerId: owner.userId });
    const pdf = fixture('doc.pdf');
    const session = await uploadFile(g.calls, 'План вечора.pdf', pdf);
    const item = guestContentItemSchema.parse((await g.calls.complete(session.uploadId)).body);
    expect(item).toMatchObject({ kind: 'DOCUMENT', processingStatus: 'NOT_REQUIRED' });

    const res = await request(server)
      .get(`/api/v1/content/${item.id}`)
      .set('Cookie', owner.cookie)
      .expect(200);
    const detail = adminContentDetailSchema.parse(res.body);
    expect(detail).toMatchObject({ mimeType: 'application/pdf', sizeBytes: pdf.length });
    expect(detail.originalUrl).toBeNull(); // documents are never opened inline
    const download = await fetch(detail.downloadUrl ?? '');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="stepler-001.pdf"; filename*=UTF-8''${encodeURIComponent('План вечора')}.pdf`,
    );
    expect(download.headers.get('content-type')).toBe('application/pdf');
    // Signed per window: the same link twice within it.
    const again = adminContentDetailSchema.parse(
      (await request(server).get(`/api/v1/content/${item.id}`).set('Cookie', owner.cookie)).body,
    );
    expect(again.downloadUrl).toBe(detail.downloadUrl);
  });

  test('a JPEG named .png is accepted and recorded as image/jpeg', async () => {
    const g = await guest();
    const session = await uploadFile(g.calls, 'photo.png', fixture('photo.jpg'));
    const item = guestContentItemSchema.parse(
      (await g.calls.complete(session.uploadId).expect(200)).body,
    );
    const media = await prisma.mediaObject.findFirstOrThrow({ where: { contentItemId: item.id } });
    expect(media.mimeType).toBe('image/jpeg');
  });

  test('multipart: parts on demand; a missing part is reported, then completion succeeds', async () => {
    const g = await guest();
    const video = bigBuffer(11 * MIB, mp4Header());
    const session = asSession(
      (await g.calls.initiate({ filename: 'clip.mp4', sizeBytes: video.length }).expect(201)).body,
    );
    expect(session).toMatchObject({ partSizeBytes: 5 * MIB, partCount: 3 });

    const { parts } = (await g.calls.parts(session.uploadId, [1, 2, 3]).expect(200)).body as {
      parts: { partNumber: number; url: string }[];
    };
    const slice = (n: number) =>
      video.subarray((n - 1) * 5 * MIB, Math.min(n * 5 * MIB, video.length));
    for (const part of parts.slice(0, 2)) {
      expect(await putTo(part.url, slice(part.partNumber))).toBe(200);
    }
    const incomplete = await g.calls.complete(session.uploadId).expect(409);
    expect(incomplete.body).toMatchObject({ code: 'UPLOAD_INCOMPLETE', missingPartNumbers: [3] });

    expect(await putTo(parts[2]?.url ?? '', slice(3))).toBe(200);
    const item = guestContentItemSchema.parse(
      (await g.calls.complete(session.uploadId).expect(200)).body,
    );
    expect(item).toMatchObject({ kind: 'VIDEO', sizeBytes: video.length });
    expect(
      (await storage.head(`collections/${g.collectionId}/uploads/${session.uploadId}/original`))
        ?.size,
    ).toBe(video.length);
    expect((await queuedJobs(prisma, 'media.video-poster')).map((job) => job.data)).toEqual([
      { contentItemId: item.id },
    ]);
    // Completed: no more part URLs, and the old ones are dead (storage ended the upload).
    await g.calls.parts(session.uploadId, [1]).expect(409);
    expect(await putTo(parts[0]?.url ?? '', slice(1))).toBeGreaterThanOrEqual(400);
  });

  test('part numbers beyond partCount → 400', async () => {
    const g = await guest();
    const session = asSession(
      (await g.calls.initiate({ filename: 'clip.mp4', sizeBytes: 11 * MIB }).expect(201)).body,
    );
    const res = await g.calls.parts(session.uploadId, [4]).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('retries and doubles: one item, one frame number, the same answer', async () => {
    const g = await guest();
    const photo = fixture('photo.jpg');
    const clientUploadId = randomUUID();
    const first = asSession(
      (
        await g.calls
          .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
          .expect(201)
      ).body,
    );
    const again = asSession(
      (
        await g.calls
          .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
          .expect(201)
      ).body,
    );
    expect(again.uploadId).toBe(first.uploadId);
    const conflict = await g.calls
      .initiate({ filename: 'a.jpg', sizeBytes: photo.length + 1, clientUploadId })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const urls = await partUrls(g.calls, first.uploadId, [1]);
    expect(await putTo(urls.get(1) ?? '', photo)).toBe(200);
    // Two at once: one records the frame; the other gets the same frame, or
    // UPLOAD_IN_PROGRESS (retryable) while the first is still checking storage.
    const results = await Promise.all([
      g.calls.complete(first.uploadId),
      g.calls.complete(first.uploadId),
    ]);
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ code: 'UPLOAD_IN_PROGRESS', retryable: true });
    }
    const retried = await g.calls.complete(first.uploadId).expect(200);
    expect((retried.body as { id: string }).id).toBe((ok[0]?.body as { id: string }).id);
    expect(await prisma.contentItem.count()).toBe(1);
    expect(
      (await prisma.collection.findUniqueOrThrow({ where: { id: g.collectionId } })).nextFrameNo,
    ).toBe(2);
    // A completed upload's id cannot be initiated again.
    await g.calls
      .initiate({ filename: 'a.jpg', sizeBytes: photo.length, clientUploadId })
      .expect(409);
  });

  test('content that is not what it claims: 422, REJECTED, bytes discarded', async () => {
    const g = await guest();
    const session = await uploadFile(g.calls, 'holiday.jpg', fixture('fake.jpg'));
    const res = await g.calls.complete(session.uploadId).expect(422);
    expect(res.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'FILE_TYPE_NOT_ALLOWED' });
    expect(await prisma.contentItem.count()).toBe(0);
    expect((await queuedJobs(prisma, 'storage.discard-upload')).map((job) => job.data)).toEqual([
      { uploadSessionId: session.uploadId },
    ]);
    await new DiscardUploadHandler(prisma, storage).handle({ uploadSessionId: session.uploadId });
    expect(await storage.head(row.storageKey)).toBeNull();
    // Completing it again: closed.
    await g.calls.complete(session.uploadId).expect(409);
  });

  test('a stored object of another size than declared: 422 UPLOAD_SIZE_MISMATCH', async () => {
    const g = await guest();
    const pdf = fixture('doc.pdf');
    const session = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: pdf.length + 10 }).expect(201)).body,
    );
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    // Signed part lengths make this impossible through the URLs; it covers an object assembled
    // earlier (a completion that failed after CompleteMultipartUpload) of an unexpected size.
    await storage.abortMultipart(row.storageKey, row.multipartUploadId);
    await storage.putObject(row.storageKey, pdf, 'application/pdf');
    const res = await g.calls.complete(session.uploadId).expect(422);
    expect(res.body).toMatchObject({ code: 'UPLOAD_SIZE_MISMATCH' });
  });

  test('completing before any byte arrived: 409 UPLOAD_INCOMPLETE, the upload stays open', async () => {
    const g = await guest();
    const session = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 100 }).expect(201)).body,
    );
    await g.calls.complete(session.uploadId).expect(409);
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row.status).toBe('INITIATED');
  });

  test('refused at initiation: too large, disallowed types; no session row', async () => {
    const g = await guest();
    const big = await g.calls.initiate({ filename: 'big.jpg', sizeBytes: 60_000_000 }).expect(422);
    expect(big.body).toMatchObject({ code: 'FILE_TOO_LARGE' });
    for (const filename of ['image.svg', 'page.html', 'setup.exe', 'archive.zip']) {
      const res = await g.calls.initiate({ filename, sizeBytes: 100 }).expect(422);
      expect(res.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    }
    const mismatch = await g.calls
      .initiate({ filename: 'a.jpg', sizeBytes: 100, mimeType: 'video/mp4' })
      .expect(422);
    expect(mismatch.body).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect(await prisma.uploadSession.count()).toBe(0);
  });

  test('expiry: completion after expiresAt → 410; the job expires stale uploads', async () => {
    const g = await guest();
    const a = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 100 }).expect(201)).body,
    );
    const b = asSession(
      (await g.calls.initiate({ filename: 'b.pdf', sizeBytes: 100 }).expect(201)).body,
    );
    const c = asSession(
      (await g.calls.initiate({ filename: 'c.pdf', sizeBytes: 100 }).expect(201)).body,
    );
    const past = new Date(Date.now() - 1000);
    await prisma.uploadSession.updateMany({
      where: { id: { in: [a.uploadId, b.uploadId] } },
      data: { expiresAt: past },
    });
    const res = await g.calls.complete(a.uploadId).expect(410);
    expect(res.body).toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(
      (await prisma.uploadSession.findUniqueOrThrow({ where: { id: a.uploadId } })).status,
    ).toBe('EXPIRED');

    await new ExpireUploadsHandler(prisma, queue).handle();
    const statuses = await prisma.uploadSession.findMany({ orderBy: { createdAt: 'asc' } });
    expect(statuses.map((row) => row.status)).toEqual(['EXPIRED', 'EXPIRED', 'INITIATED']);
    const discards = (await queuedJobs(prisma, 'storage.discard-upload')).map(
      (job) => (job.data as { uploadSessionId: string }).uploadSessionId,
    );
    expect(discards.sort()).toEqual([a.uploadId, b.uploadId].sort());
    expect(discards).not.toContain(c.uploadId);
  });

  test('cancel: 204 and ABORTED, again 204; after completion 409', async () => {
    const g = await guest();
    const open = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 100 }).expect(201)).body,
    );
    await g.calls.cancel(open.uploadId).expect(204);
    expect(
      (await prisma.uploadSession.findUniqueOrThrow({ where: { id: open.uploadId } })).status,
    ).toBe('ABORTED');
    expect(await queuedJobs(prisma, 'storage.discard-upload')).toHaveLength(1);
    await g.calls.cancel(open.uploadId).expect(204);
    await g.calls.parts(open.uploadId, [1]).expect(409);

    const done = await uploadFile(g.calls, 'b.pdf', fixture('doc.pdf'));
    await g.calls.complete(done.uploadId).expect(200);
    const res = await g.calls.cancel(done.uploadId).expect(409);
    expect(res.body).toMatchObject({ code: 'UPLOAD_CLOSED' });
  });

  test('the 11th upload open at once → 429', async () => {
    const g = await guest();
    for (let i = 0; i < 10; i += 1) {
      await g.calls.initiate({ filename: `${i}.pdf`, sizeBytes: 100 }).expect(201);
    }
    const res = await g.calls.initiate({ filename: 'x.pdf', sizeBytes: 100 }).expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  test('discard keeps a completed upload; a purge aborts open multipart uploads', async () => {
    const g = await guest();
    const done = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    await g.calls.complete(done.uploadId).expect(200);
    const doneRow = await prisma.uploadSession.findUniqueOrThrow({ where: { id: done.uploadId } });
    await new DiscardUploadHandler(prisma, storage).handle({ uploadSessionId: done.uploadId });
    expect(await storage.head(doneRow.storageKey)).not.toBeNull();

    const open = asSession(
      (await g.calls.initiate({ filename: 'clip.mp4', sizeBytes: 11 * MIB }).expect(201)).body,
    );
    const openRow = await prisma.uploadSession.findUniqueOrThrow({ where: { id: open.uploadId } });
    // Deleted long enough ago for every upload URL to have expired.
    await prisma.collection.update({
      where: { id: g.collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date(Date.now() - 2 * 3600_000) },
    });
    let aborted: string[] = [];
    const watched = Object.assign(Object.create(storage) as S3ObjectStorage, {
      abortMultipart: async (key: string, uploadId: string) => {
        aborted.push(uploadId);
        await storage.abortMultipart(key, uploadId);
      },
    });
    await new PurgeCollectionHandler(prisma, watched, workerEnv).handle({
      collectionId: g.collectionId,
    });
    expect(aborted).toEqual([openRow.multipartUploadId]);
    expect(await storage.listParts(openRow.storageKey, openRow.multipartUploadId ?? '')).toBeNull();
    expect(await prisma.uploadSession.count()).toBe(0);
    expect(await storage.head(doneRow.storageKey)).toBeNull();
    aborted = [];
  });

  test('a purge right after deletion waits for upload URLs to expire', async () => {
    const g = await guest();
    await prisma.collection.update({
      where: { id: g.collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    await new PurgeCollectionHandler(prisma, storage, workerEnv).handle({
      collectionId: g.collectionId,
    });
    expect(await prisma.collection.count({ where: { id: g.collectionId } })).toBe(1);
  });

  describe('part URLs die with their upload (review I1)', () => {
    const keyOf = async (uploadId: string) =>
      (await prisma.uploadSession.findUniqueOrThrow({ where: { id: uploadId } })).storageKey;

    test('after completion a part URL cannot replace the verified original', async () => {
      const g = await guest();
      const photo = fixture('photo.jpg');
      const session = await uploadFile(g.calls, 'a.jpg', photo);
      await g.calls.complete(session.uploadId).expect(200);
      const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(photo.length));
      expect(await putTo(session.urls.get(1) ?? '', html)).toBeGreaterThanOrEqual(400);
      const head = await storage.readRange(await keyOf(session.uploadId), 0, 3);
      expect([...head.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    });

    test('after cancel and discard a part URL writes nothing; no object exists', async () => {
      const g = await guest();
      const pdf = fixture('doc.pdf');
      const session = asSession(
        (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: pdf.length }).expect(201)).body,
      );
      const urls = await partUrls(g.calls, session.uploadId, [1]);
      await g.calls.cancel(session.uploadId).expect(204);
      await new DiscardUploadHandler(prisma, storage).handle({ uploadSessionId: session.uploadId });
      expect(await putTo(urls.get(1) ?? '', pdf)).toBeGreaterThanOrEqual(400);
      const key = await keyOf(session.uploadId);
      expect(await storage.head(key)).toBeNull();
    });

    test('an admin delete then purge leaves no object, even when an old URL is reused', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      const g = await guest({ ownerId: owner.userId });
      const pdf = fixture('doc.pdf');
      const session = await uploadFile(g.calls, 'a.pdf', pdf);
      const item = guestContentItemSchema.parse(
        (await g.calls.complete(session.uploadId).expect(200)).body,
      );
      const key = await keyOf(session.uploadId);
      await request(server)
        .delete(`/api/v1/content/${item.id}`)
        .set('Cookie', owner.cookie)
        .set('Origin', ORIGIN)
        .expect(204);
      await new PurgeContentHandler(prisma, storage, workerEnv).handle({ contentItemId: item.id });
      expect(await storage.head(key)).toBeNull();
      expect(await putTo(session.urls.get(1) ?? '', pdf)).toBeGreaterThanOrEqual(400);
      expect(await storage.head(key)).toBeNull();
    });

    test('a part PUT of another length than signed → 403', async () => {
      const g = await guest();
      const session = asSession(
        (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 100 }).expect(201)).body,
      );
      const urls = await partUrls(g.calls, session.uploadId, [1]);
      expect(await putTo(urls.get(1) ?? '', Buffer.alloc(101))).toBe(403);
    });
  });

  test('presigned URLs never appear in error bodies', async () => {
    const g = await guest();
    const session = await uploadFile(g.calls, 'holiday.jpg', fixture('fake.jpg'));
    const res = await g.calls.complete(session.uploadId);
    expect(res.text).not.toMatch(/X-Amz-|https?:\/\//);
  });
});

describe('uploads API: quotas', () => {
  const MB = 1_000_000;
  const quotaEnv = testEnv(UPLOAD_ENV);
  let quotaApp: INestApplication;
  let quotaServer: Server;
  let quotaTokens: GuestLinkTokens;

  beforeAll(async () => {
    useTestPlanLimits({ collectionStorageBytes: BigInt(10 * MB), storageBytes: BigInt(10 * MB) });
    ({ app: quotaApp, server: quotaServer, tokens: quotaTokens } = await startApp(quotaEnv));
  });

  afterAll(async () => {
    useTestPlanLimits();
    await quotaApp.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function quotaGuest(collectionId: string, linkToken: string) {
    const cookie = await joinAsGuest(quotaServer, collectionId, linkToken);
    return uploadCalls(quotaServer, collectionId, cookie);
  }

  test('two guests reserve 6 MB at once against 10 MB: one 201, one 409', async () => {
    const { collectionId, link } = await seedCollection(prisma, quotaTokens);
    const [a, b] = [
      await quotaGuest(collectionId, link.token),
      await quotaGuest(collectionId, link.token),
    ];
    const results = await Promise.all([
      a.initiate({ filename: 'a.mp4', sizeBytes: 6 * MB }),
      b.initiate({ filename: 'b.mp4', sizeBytes: 6 * MB }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  test('the account limit holds across two collections of one owner', async () => {
    const x = await seedCollection(prisma, quotaTokens);
    const y = await seedCollection(prisma, quotaTokens, { ownerId: x.ownerId });
    const gx = await quotaGuest(x.collectionId, x.link.token);
    const gy = await quotaGuest(y.collectionId, y.link.token);
    const results = await Promise.all([
      gx.initiate({ filename: 'a.mp4', sizeBytes: 6 * MB }),
      gy.initiate({ filename: 'b.mp4', sizeBytes: 6 * MB }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test('after the admin deletes a 6 MB item, a new 6 MB upload fits at once', async () => {
    const owner = await signInAs(quotaApp, prisma, 'olena@example.com');
    const { collectionId, link } = await seedCollection(prisma, quotaTokens, {
      ownerId: owner.userId,
    });
    const calls = await quotaGuest(collectionId, link.token);
    const video = bigBuffer(6 * MB, mp4Header());
    const session = await uploadFile(calls, 'a.mp4', video);
    const item = guestContentItemSchema.parse(
      (await calls.complete(session.uploadId).expect(200)).body,
    );
    await calls.initiate({ filename: 'b.mp4', sizeBytes: 6 * MB }).expect(409);
    await request(quotaServer)
      .delete(`/api/v1/content/${item.id}`)
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    await calls.initiate({ filename: 'b.mp4', sizeBytes: 6 * MB }).expect(201);
  });
});

describe('uploads API: storage down', () => {
  test('a multipart initiation → 503 DEPENDENCY_UNAVAILABLE, retryable', async () => {
    await resetDatabase(prisma);
    const down = await startApp(testEnv({ ...UPLOAD_ENV, S3_ENDPOINT: 'http://127.0.0.1:9' }));
    try {
      const seeded = await seedCollection(prisma, down.tokens);
      const cookie = await joinAsGuest(down.server, seeded.collectionId, seeded.link.token);
      const res = await uploadCalls(down.server, seeded.collectionId, cookie)
        .initiate({ filename: 'clip.mp4', sizeBytes: 11 * MIB })
        .expect(503);
      expect(res.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', retryable: true });
      expect(await prisma.uploadSession.count()).toBe(0);
    } finally {
      await down.app.close();
    }
  });
});
