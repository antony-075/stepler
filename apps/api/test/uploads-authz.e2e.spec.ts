import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, seedCollection } from './support/guests.js';
import { asSession, fixture, uploadCalls, uploadFile } from './support/uploads.js';

const env = testEnv();
const prisma = new PrismaService(env);
let app: INestApplication;
let server: Server;
let tokens: GuestLinkTokens;

/** A collection with two guests (A and B) on its default link, and a guest C of another one. */
async function setup() {
  const x = await seedCollection(prisma, tokens);
  const y = await seedCollection(prisma, tokens);
  const a = await joinAsGuest(server, x.collectionId, x.link.token);
  const b = await joinAsGuest(server, x.collectionId, x.link.token);
  const c = await joinAsGuest(server, y.collectionId, y.link.token);
  return {
    x,
    linkId: x.link.id,
    a: uploadCalls(server, x.collectionId, a),
    b: uploadCalls(server, x.collectionId, b),
    // Guest C's cookie, sent to collection X's routes.
    cInX: uploadCalls(server, x.collectionId, c),
  };
}

/** No content item exists, the upload is REJECTED for `reason`, and its discard is queued. */
async function expectRefused(uploadId: string, reason: string) {
  expect(await prisma.contentItem.count()).toBe(0);
  const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: uploadId } });
  expect(row).toMatchObject({ status: 'REJECTED', rejectReason: reason });
  const discards = await queuedJobs(prisma, 'storage.discard-upload');
  expect(discards.map((job) => job.data)).toEqual([{ uploadSessionId: uploadId }]);
}

describe('uploads authorization', () => {
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

  test("guest B cannot complete, cancel or sign parts of guest A's upload: 404", async () => {
    const s = await setup();
    const session = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    const multipart = asSession(
      (await s.a.initiate({ filename: 'clip.mp4', sizeBytes: 200_000_000 }).expect(201)).body,
    );
    for (const res of [
      await s.b.complete(session.uploadId),
      await s.b.cancel(session.uploadId),
      await s.b.parts(multipart.uploadId, [1]),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(res.text).not.toMatch(/X-Amz-/);
    }
    expect((await prisma.uploadSession.findMany()).map((row) => row.status).sort()).toEqual([
      'INITIATED',
      'INITIATED',
    ]);
    await s.a.complete(session.uploadId).expect(200);
  });

  test("a guest of another collection gets 401 on this collection's routes", async () => {
    const s = await setup();
    const session = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    const res = await s.cInX.complete(session.uploadId).expect(401);
    expect(res.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
    await s.cInX.initiate({ filename: 'b.pdf', sizeBytes: 10 }).expect(401);
  });

  test('link paused between PUT and complete: 403 LINK_INACTIVE, REJECTED', async () => {
    const s = await setup();
    const session = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    await prisma.guestLink.update({ where: { id: s.linkId }, data: { status: 'INACTIVE' } });
    const res = await s.a.complete(session.uploadId).expect(403);
    expect(res.body).toMatchObject({ code: 'LINK_INACTIVE' });
    await expectRefused(session.uploadId, 'LINK_INACTIVE');
    // New uploads are refused outright.
    await s.a.initiate({ filename: 'b.pdf', sizeBytes: 10 }).expect(403);
  });

  test('link revoked: 410 LINK_REVOKED, REJECTED', async () => {
    const s = await setup();
    const session = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    await prisma.guestLink.update({
      where: { id: s.linkId },
      data: { status: 'REVOKED', revokedAt: new Date(), tokenCiphertext: null, tokenKeyId: null },
    });
    const res = await s.a.complete(session.uploadId).expect(410);
    expect(res.body).toMatchObject({ code: 'LINK_REVOKED' });
    await expectRefused(session.uploadId, 'LINK_REVOKED');
  });

  test('videos switched off before completion: 403 FORBIDDEN, REJECTED', async () => {
    const s = await setup();
    const video = Buffer.from(fixture('clip.mp4'));
    const session = await uploadFile(s.a, 'clip.mp4', video);
    await prisma.guestLink.update({ where: { id: s.linkId }, data: { canUploadVideos: false } });
    const res = await s.a.complete(session.uploadId).expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    await expectRefused(session.uploadId, 'FORBIDDEN');
    // And the type is refused at initiation.
    await s.a.initiate({ filename: 'b.mp4', sizeBytes: 10 }).expect(403);
  });

  test('collection archived: 403 COLLECTION_ARCHIVED, REJECTED', async () => {
    const s = await setup();
    const session = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    await prisma.collection.update({
      where: { id: s.x.collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const res = await s.a.complete(session.uploadId).expect(403);
    expect(res.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    await expectRefused(session.uploadId, 'COLLECTION_ARCHIVED');
  });

  test('collection deleted: 410 COLLECTION_UNAVAILABLE, REJECTED; cancel still frees it', async () => {
    const s = await setup();
    const done = await uploadFile(s.a, 'a.pdf', fixture('doc.pdf'));
    const open = asSession(
      (await s.a.initiate({ filename: 'b.pdf', sizeBytes: 10 }).expect(201)).body,
    );
    await prisma.collection.update({
      where: { id: s.x.collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    const res = await s.a.complete(done.uploadId).expect(410);
    expect(res.body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    await expectRefused(done.uploadId, 'COLLECTION_UNAVAILABLE');
    await s.a.cancel(open.uploadId).expect(204);
    expect(
      (await prisma.uploadSession.findUniqueOrThrow({ where: { id: open.uploadId } })).status,
    ).toBe('ABORTED');
    await s.a.parts(open.uploadId, [1]).expect(410);
  });
});
