import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { asSession, fixture, uploadCalls, uploadFile } from './support/uploads.js';

// Pre-launch security review (checklist 3.7): cross-tenant attempts the other suites do not try.

const env = testEnv();
const prisma = new PrismaService(env);

const guestPath = (collectionId: string, path: string) =>
  `/api/v1/guest/collections/${collectionId}/${path}`;

describe('guest access review: cross-collection ids', () => {
  let app: INestApplication;
  let server: Server;
  let tokens: GuestLinkTokens;

  beforeAll(async () => {
    app = await createApp(env);
    await listenOnLoopback(app);
    server = app.getHttpServer() as Server;
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** Guest A in collection X, guest C in collection Y, both with the shared gallery. */
  async function twoCollections() {
    const x = await seedCollection(prisma, tokens, { permissions: SHARED_GALLERY });
    const y = await seedCollection(prisma, tokens, { permissions: SHARED_GALLERY });
    const a = await joinAsGuest(server, x.collectionId, x.link.token);
    const c = await joinAsGuest(server, y.collectionId, y.link.token);
    return { x, y, a, c };
  }

  test("X's upload ids on Y's path, with Y's own session: 404 for parts, complete and cancel", async () => {
    const { x, y, a, c } = await twoCollections();
    const inX = uploadCalls(server, x.collectionId, a);
    const done = await uploadFile(inX, 'a.pdf', fixture('doc.pdf'));
    const open = asSession(
      (await inX.initiate({ filename: 'clip.mp4', sizeBytes: 200_000_000 }).expect(201)).body,
    );
    const cInY = uploadCalls(server, y.collectionId, c);
    for (const res of [
      await cInY.parts(open.uploadId, [1]),
      await cInY.complete(done.uploadId),
      await cInY.cancel(open.uploadId),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(res.text).not.toMatch(/X-Amz-/);
    }
    expect(await prisma.contentItem.count()).toBe(0);
    expect((await prisma.uploadSession.findMany()).map((row) => row.status)).toEqual([
      'INITIATED',
      'INITIATED',
    ]);
  });

  test("Y's guest reports X's frame through Y's path: 404, no report", async () => {
    const { x, y, a, c } = await twoCollections();
    const created = await request(server)
      .post(guestPath(x.collectionId, 'texts'))
      .set('Origin', ORIGIN)
      .set('Cookie', a)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'Вітаю' })
      .expect(201);
    const itemId = (created.body as { id: string }).id;

    const res = await request(server)
      .post(guestPath(y.collectionId, `content/${itemId}/reports`))
      .set('Origin', ORIGIN)
      .set('Cookie', c)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'PRIVACY', locale: 'en' })
      .expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.contentReport.count()).toBe(0);
  });

  test("Y's guest reads and deletes X's frame through Y's path: 404, untouched", async () => {
    const { x, y, a, c } = await twoCollections();
    const created = await request(server)
      .post(guestPath(x.collectionId, 'texts'))
      .set('Origin', ORIGIN)
      .set('Cookie', a)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'Вітаю' })
      .expect(201);
    const itemId = (created.body as { id: string }).id;

    await request(server)
      .get(guestPath(y.collectionId, `content/${itemId}`))
      .set('Cookie', c)
      .expect(404);
    await request(server)
      .delete(guestPath(y.collectionId, `content/${itemId}`))
      .set('Origin', ORIGIN)
      .set('Cookie', c)
      .expect(404);
    const list = await request(server)
      .get(guestPath(y.collectionId, 'content?scope=all'))
      .set('Cookie', c)
      .expect(200);
    expect((list.body as { items: unknown[] }).items).toEqual([]);
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(row.deletedAt).toBeNull();
  });

  test('an owner whose account is deleted closes every guest route, even if a collection were left live', async () => {
    // ADR 0020 marks every collection DELETING in the deletion transaction. This proves the guest
    // routes do not depend on that alone: the owner's status itself closes them.
    const x = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server, x.collectionId, x.link.token);
    await prisma.user.update({
      where: { id: x.ownerId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    const resolve = await request(server)
      .post('/api/v1/guest/links/resolve')
      .set('Origin', ORIGIN)
      .send({ linkToken: x.link.token })
      .expect(410);
    expect(resolve.body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    await request(server)
      .post('/api/v1/guest/links/theme')
      .send({ linkToken: x.link.token })
      .expect(404);
    await request(server)
      .post(guestPath(x.collectionId, 'session'))
      .set('Origin', ORIGIN)
      .send({ linkToken: x.link.token })
      .expect(410);
    await request(server)
      .get(guestPath(x.collectionId, 'context'))
      .set('Cookie', cookie)
      .expect(410);
    await request(server)
      .get(guestPath(x.collectionId, 'content?scope=own'))
      .set('Cookie', cookie)
      .expect(410);
    const upload = await uploadCalls(server, x.collectionId, cookie)
      .initiate({ filename: 'a.pdf', sizeBytes: 10 })
      .expect(410);
    expect(upload.body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    expect(await prisma.uploadSession.count()).toBe(0);
  });
});

describe('guest access review: the name change is rate limited', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE: '2' }));
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  test('the third PATCH session from one IP in a minute → 429 RATE_LIMITED', async () => {
    await resetDatabase(prisma);
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const rename = (name: string) =>
      request(server())
        .patch(guestPath(collectionId, 'session'))
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ name });
    await rename('Оля').expect(200);
    await rename('Оля К.').expect(200);
    const res = await rename('Ольга').expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    const session = await prisma.guestSession.findFirstOrThrow({ where: { collectionId } });
    expect(session.contributorName).toBe('Оля К.');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
