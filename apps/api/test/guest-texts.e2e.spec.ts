import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { guestContentItemSchema, guestContextSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import {
  CONTRIBUTE_ONLY,
  joinAsGuest,
  ORIGIN,
  seedCollection,
  SHARED_GALLERY,
} from './support/guests.js';

const prisma = createTestPrisma();

class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

describe('guest names and texts', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const logs = new CaptureStream();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(
      testEnv({ LOG_LEVEL: 'info', LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR: '30' }),
      { logDestination: logs },
    );
    await app.init();
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    logs.output = '';
  });

  const postText = (collectionId: string, cookie: string, body: unknown, key?: string) => {
    const req = request(server())
      .post(`/api/v1/guest/collections/${collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    if (key !== undefined) req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

  const patchName = (collectionId: string, cookie: string, name: string | null) =>
    request(server())
      .patch(`/api/v1/guest/collections/${collectionId}/session`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name });

  async function guest(permissions = CONTRIBUTE_ONLY) {
    const seeded = await seedCollection(prisma, tokens, { permissions });
    const cookie = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    return { ...seeded, cookie };
  }

  test('texts get frame numbers 1, 2, …; a deleted number is never reused', async () => {
    const { collectionId, cookie } = await guest();
    const first = await postText(collectionId, cookie, { body: '  Вітаємо! \n' }, randomUUID());
    expect(first.status).toBe(201);
    const item = guestContentItemSchema.parse(first.body);
    expect(item).toMatchObject({
      kind: 'TEXT',
      frameNo: 1,
      isOwn: true,
      canDelete: true,
      text: 'Вітаємо!',
      processingStatus: 'NOT_REQUIRED',
    });
    const second = guestContentItemSchema.parse(
      (await postText(collectionId, cookie, { body: 'Два' }, randomUUID()).expect(201)).body,
    );
    expect(second.frameNo).toBe(2);
    await prisma.contentItem.update({ where: { id: second.id }, data: { deletedAt: new Date() } });
    const third = guestContentItemSchema.parse(
      (await postText(collectionId, cookie, { body: 'Три' }, randomUUID()).expect(201)).body,
    );
    expect(third.frameNo).toBe(3);
  });

  test('Review Focus 3: one Idempotency-Key → one item, the same body; a different body → 409', async () => {
    const { collectionId, cookie } = await guest();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      postText(collectionId, cookie, { body: 'Вітаємо!' }, key),
      postText(collectionId, cookie, { body: 'Вітаємо!' }, key),
    ]);
    expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));
    for (const res of [a, b]) expect(res.status === 200 || res.status === 201).toBe(true);
    expect((a.body as { id: string }).id).toBe((b.body as { id: string }).id);
    expect(a.body).toEqual(b.body);
    expect(await prisma.contentItem.count()).toBe(1);

    const retry = await postText(collectionId, cookie, { body: 'Вітаємо!' }, key).expect(200);
    expect(retry.body).toEqual(a.body);
    const conflict = await postText(collectionId, cookie, { body: 'Інше' }, key).expect(409);
    expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await prisma.contentItem.count()).toBe(1);
    // The next new text takes the next number: the losing duplicate consumed none.
    const next = await postText(collectionId, cookie, { body: 'x' }, randomUUID()).expect(201);
    expect((next.body as { frameNo: number }).frameNo).toBe(2);
  });

  test('20 concurrent texts from two guests → frame numbers exactly 1…20', async () => {
    const { collectionId, link, cookie } = await guest();
    const other = await joinAsGuest(server(), collectionId, link.token);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        postText(collectionId, i % 2 === 0 ? cookie : other, { body: `#${i}` }, randomUUID()),
      ),
    );
    for (const res of responses) expect(res.status).toBe(201);
    const numbers = responses.map((res) => (res.body as { frameNo: number }).frameNo);
    expect(numbers.sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test('permission, validation and the Idempotency-Key header', async () => {
    const { collectionId, cookie } = await guest({ ...SHARED_GALLERY, canSubmitText: false });
    const forbidden = await postText(collectionId, cookie, { body: 'x' }, randomUUID()).expect(403);
    expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN' });

    const allowed = await guest();
    for (const body of [{ body: '😀'.repeat(5001) }, { body: '   ' }, { body: 'a\u0000b' }, {}]) {
      const res = await postText(allowed.collectionId, allowed.cookie, body, randomUUID()).expect(
        400,
      );
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    for (const key of [undefined, 'not-a-uuid']) {
      const res = await postText(allowed.collectionId, allowed.cookie, { body: 'x' }, key).expect(
        400,
      );
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    // 5000 emoji are 5000 characters.
    await postText(
      allowed.collectionId,
      allowed.cookie,
      { body: '😀'.repeat(5000) },
      randomUUID(),
    ).expect(201);
    expect(await prisma.contentItem.count()).toBe(1);
  });

  test('no session, another collection’s session, or a paused link → no text', async () => {
    const x = await guest();
    const y = await guest();
    const none = await request(server())
      .post(`/api/v1/guest/collections/${x.collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'x' })
      .expect(401);
    expect(none.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
    await postText(x.collectionId, y.cookie, { body: 'x' }, randomUUID()).expect(401);
    await prisma.guestLink.update({ where: { id: x.link.id }, data: { status: 'INACTIVE' } });
    const paused = await postText(x.collectionId, x.cookie, { body: 'x' }, randomUUID()).expect(
      403,
    );
    expect(paused.body).toMatchObject({ code: 'LINK_INACTIVE' });
    expect(await prisma.contentItem.count()).toBe(0);
  });

  test('a guest’s name: saved, snapshotted on texts, renamed on live items [C4], skipped', async () => {
    const { collectionId, cookie } = await guest();
    const named = guestContextSchema.parse(
      (await patchName(collectionId, cookie, ' Ірина ').expect(200)).body,
    );
    expect(named.guest).toEqual({ name: 'Ірина', nameAnswered: true });

    const text = await postText(collectionId, cookie, { body: 'Вітаємо!' }, randomUUID()).expect(
      201,
    );
    const id = (text.body as { id: string }).id;
    // The guest's own response never carries the name.
    expect(text.body).not.toHaveProperty('contributorName');
    expect(JSON.stringify(text.body)).not.toContain('Ірина');
    expect((await prisma.contentItem.findUniqueOrThrow({ where: { id } })).contributorName).toBe(
      'Ірина',
    );
    const deleted = await postText(collectionId, cookie, { body: 'Стерте' }, randomUUID()).expect(
      201,
    );
    const deletedId = (deleted.body as { id: string }).id;
    await prisma.contentItem.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });

    await patchName(collectionId, cookie, 'Ірина К.').expect(200);
    expect((await prisma.contentItem.findUniqueOrThrow({ where: { id } })).contributorName).toBe(
      'Ірина К.',
    );
    // Deleted items keep their snapshot.
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: deletedId } })).contributorName,
    ).toBe('Ірина');

    const skipped = guestContextSchema.parse(
      (await patchName(collectionId, cookie, null).expect(200)).body,
    );
    expect(skipped.guest).toEqual({ name: null, nameAnswered: true });
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id } })).contributorName,
    ).toBeNull();
  });

  test('the name: validation, and only for links that can contribute', async () => {
    const { collectionId, cookie } = await guest();
    for (const name of ['', 'я'.repeat(81), 'Ір\nина']) {
      const res = await patchName(collectionId, cookie, name).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const viewOnly = await guest({
      canUploadPhotos: false,
      canUploadVideos: false,
      canUploadDocuments: false,
      canSubmitText: false,
      canViewGallery: true,
      canDeleteOwn: false,
    });
    const res = await patchName(viewOnly.collectionId, viewOnly.cookie, 'Ірина').expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  test('an archived collection takes no text', async () => {
    const { collectionId, cookie } = await guest();
    await prisma.collection.update({
      where: { id: collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const res = await postText(collectionId, cookie, { body: 'x' }, randomUUID()).expect(403);
    expect(res.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
  });

  test('neither the text nor the name reaches the logs', async () => {
    const { collectionId, cookie } = await guest();
    await patchName(collectionId, cookie, 'Соломія').expect(200);
    await postText(collectionId, cookie, { body: 'Секретне побажання' }, randomUUID()).expect(201);
    await postText(collectionId, cookie, { body: '😀'.repeat(5001) }, randomUUID()).expect(400);
    expect(logs.output).toContain('/texts');
    for (const secret of ['Соломія', 'Секретне побажання', '😀']) {
      expect(logs.output).not.toContain(secret);
    }
  });
});

describe('guest text rate limit', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR: '2' }));
    await app.init();
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  test('the third text in an hour → 429 RATE_LIMITED; another session is not affected', async () => {
    await resetDatabase(prisma);
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const post = (c: string) =>
      request(server())
        .post(`/api/v1/guest/collections/${collectionId}/texts`)
        .set('Origin', ORIGIN)
        .set('Cookie', c)
        .set('Idempotency-Key', randomUUID())
        .send({ body: 'x' });
    await post(cookie).expect(201);
    await post(cookie).expect(201);
    const res = await post(cookie).expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await post(await joinAsGuest(server(), collectionId, link.token)).expect(201);
  });
});

describe('guest text and read limits per IP', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(
      testEnv({ LIMIT_TEXTS_PER_IP_PER_MINUTE: '2', LIMIT_GUEST_READS_PER_IP_PER_MINUTE: '2' }),
    );
    await app.init();
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  test('new sessions do not reset it: the third text from one IP in a minute → 429', async () => {
    await resetDatabase(prisma);
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const post = (cookie: string) =>
      request(server())
        .post(`/api/v1/guest/collections/${collectionId}/texts`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .set('Idempotency-Key', randomUUID())
        .send({ body: 'x' });
    const fresh = () => joinAsGuest(server(), collectionId, link.token);
    await post(await fresh()).expect(201);
    await post(await fresh()).expect(201);
    const res = await post(await fresh()).expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(await prisma.contentItem.count()).toBe(2);
  });

  test('guest reads are limited per IP and route', async () => {
    await resetDatabase(prisma);
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const read = (path: string) =>
      request(server())
        .get(`/api/v1/guest/collections/${collectionId}/${path}`)
        .set('Cookie', cookie);
    await read('context').expect(200);
    await read('context').expect(200);
    expect((await read('context').expect(429)).body).toMatchObject({ code: 'RATE_LIMITED' });
    await read('content?scope=own').expect(200);
    await read('content?scope=own').expect(200);
    await read('content?scope=own').expect(429);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
