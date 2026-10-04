import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { guestContextSchema, resolveGuestLinkResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import {
  addLink,
  CONTRIBUTE_ONLY,
  guestCookieOf,
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

describe('guest sessions [C3]', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const logs = new CaptureStream();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LOG_LEVEL: 'info' }), { logDestination: logs });
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

  const exchange = (collectionId: string, linkToken: string, cookie?: string) => {
    const req = request(server())
      .post(`/api/v1/guest/collections/${collectionId}/session`)
      .set('Origin', ORIGIN);
    if (cookie !== undefined) req.set('Cookie', cookie);
    return req.send({ linkToken });
  };

  const context = (collectionId: string, cookie?: string) => {
    const req = request(server()).get(`/api/v1/guest/collections/${collectionId}/context`);
    if (cookie !== undefined) req.set('Cookie', cookie);
    return req;
  };

  test('the first exchange creates a session and sets the per-collection cookie', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const res = await exchange(collectionId, link.token).expect(200);

    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('st_gs='),
    );
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(`Path=/api/v1/guest/collections/${collectionId}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=34560000');
    const token = guestCookieOf(setCookie).slice('st_gs='.length);

    const sessions = await prisma.guestSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashToken(token));
    expect(sessions[0]?.currentLinkId).toBe(link.id);

    expect(guestContextSchema.parse(res.body)).toEqual({
      collection: {
        id: collectionId,
        title: 'Весілля',
        description: 'Опис',
        welcomeMessage: null,
        cover: null,
      },
      permissions: CONTRIBUTE_ONLY,
      guest: { name: null, nameAnswered: false },
      limits: {
        maxFileBytes: { photo: 50_000_000, video: 2_000_000_000, document: 50_000_000 },
        filesPerBatch: 100,
        textMaxChars: 5000,
      },
      // Contribution-only: no counts (DESIGN-SYSTEM §11.3).
      counts: null,
    });
    // The session id never leaves the cookie.
    expect(JSON.stringify(res.body)).not.toContain(sessions[0]?.id);
  });

  test('an exchange with the cookie through another link re-binds the same session (F5)', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const viewOnly = {
      ...CONTRIBUTE_ONLY,
      canUploadPhotos: false,
      canUploadVideos: false,
      canUploadDocuments: false,
      canSubmitText: false,
      canDeleteOwn: false,
      canViewGallery: true,
    };
    const linkB = await addLink(prisma, tokens, collectionId, viewOnly);

    const res = await exchange(collectionId, linkB.token, cookie).expect(200);
    const sessions = await prisma.guestSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.currentLinkId).toBe(linkB.id);
    // Permissions narrow with the link the guest came through.
    expect(guestContextSchema.parse(res.body).permissions).toEqual(viewOnly);
    // The same cookie is set again, renewing its lifetime.
    expect(guestCookieOf(res.headers['set-cookie'])).toBe(cookie);
    expect(
      guestContextSchema.parse((await context(collectionId, cookie).expect(200)).body),
    ).toMatchObject({
      permissions: viewOnly,
      counts: { total: 0, lastAddedAt: null },
    });
  });

  test("a link of collection Y on collection X's path → 404, no session, no cookie", async () => {
    const x = await seedCollection(prisma, tokens);
    const y = await seedCollection(prisma, tokens);
    const res = await exchange(x.collectionId, y.link.token).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.guestSession.count()).toBe(0);
  });

  test("a cookie of collection Y is no session in X; X's exchange creates a new one", async () => {
    const x = await seedCollection(prisma, tokens);
    const y = await seedCollection(prisma, tokens);
    const yCookie = await joinAsGuest(server(), y.collectionId, y.link.token);
    const res = await exchange(x.collectionId, x.link.token, yCookie).expect(200);
    expect(guestCookieOf(res.headers['set-cookie'])).not.toBe(yCookie);
    expect(await prisma.guestSession.count({ where: { collectionId: x.collectionId } })).toBe(1);
  });

  test('context: no cookie, an unknown cookie or another collection’s cookie → 401', async () => {
    const x = await seedCollection(prisma, tokens);
    const y = await seedCollection(prisma, tokens);
    const yCookie = await joinAsGuest(server(), y.collectionId, y.link.token);

    for (const cookie of [undefined, 'st_gs=nope', `st_gs=${'a'.repeat(43)}`, yCookie]) {
      const res = await context(x.collectionId, cookie).expect(401);
      expect(res.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
    }
    await context(y.collectionId, yCookie).expect(200);
    // A malformed collection id is no collection.
    expect((await context('not-a-uuid', yCookie).expect(404)).body).toMatchObject({
      code: 'NOT_FOUND',
    });
    // The admin session cookie is not a guest session.
    expect((await context(x.collectionId, 'st_session=abc').expect(401)).body).toMatchObject({
      code: 'GUEST_SESSION_REQUIRED',
    });
  });

  test('link and collection states apply on the very next request ([G5] order)', async () => {
    const { ownerId, collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const expectState = async (status: number, code: string) => {
      const res = await context(collectionId, cookie).expect(status);
      expect(res.body).toMatchObject({ code });
      expect(JSON.stringify(res.body)).not.toContain('Весілля');
    };

    await prisma.guestLink.update({ where: { id: link.id }, data: { status: 'INACTIVE' } });
    await expectState(403, 'LINK_INACTIVE');
    await prisma.guestLink.update({ where: { id: link.id }, data: { status: 'ACTIVE' } });
    await context(collectionId, cookie).expect(200);

    await prisma.collection.update({
      where: { id: collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await expectState(403, 'COLLECTION_ARCHIVED');
    await prisma.collection.update({
      where: { id: collectionId },
      data: { status: 'ACTIVE', archivedAt: null },
    });

    await prisma.user.update({
      where: { id: ownerId },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
    await expectState(410, 'COLLECTION_UNAVAILABLE');
    await prisma.user.update({
      where: { id: ownerId },
      data: { status: 'ACTIVE', blockedAt: null },
    });
    await context(collectionId, cookie).expect(200);

    await prisma.guestLink.update({
      where: { id: link.id },
      data: { status: 'REVOKED', revokedAt: new Date(), tokenCiphertext: null, tokenKeyId: null },
    });
    await expectState(410, 'LINK_REVOKED');

    await prisma.collection.update({
      where: { id: collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    await expectState(410, 'COLLECTION_UNAVAILABLE');
  });

  test('the exchange reports link states like resolve does', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    await prisma.guestLink.update({ where: { id: link.id }, data: { status: 'INACTIVE' } });
    expect((await exchange(collectionId, link.token).expect(403)).body).toMatchObject({
      code: 'LINK_INACTIVE',
    });
    expect(await prisma.guestSession.count()).toBe(0);
  });

  test('context counts only non-deleted items, and only with the shared gallery', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens, {
      permissions: SHARED_GALLERY,
    });
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    const base = { collectionId, kind: 'TEXT' as const, processingStatus: 'NOT_REQUIRED' as const };
    await prisma.contentItem.create({ data: { ...base, frameNo: 1, textBody: 'a' } });
    const newest = await prisma.contentItem.create({
      data: { ...base, frameNo: 2, textBody: 'b' },
    });
    await prisma.contentItem.create({
      data: { ...base, frameNo: 3, textBody: 'c', deletedAt: new Date() },
    });
    const body = guestContextSchema.parse((await context(collectionId, cookie).expect(200)).body);
    expect(body.counts).toEqual({ total: 2, lastAddedAt: newest.createdAt.toISOString() });
  });

  test('public, but the CSRF origin check applies to the exchange', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const res = await request(server())
      .post(`/api/v1/guest/collections/${collectionId}/session`)
      .send({ linkToken: link.token })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    expect(await prisma.guestSession.count()).toBe(0);
  });

  test('rejects invalid bodies and collection ids', async () => {
    const { collectionId } = await seedCollection(prisma, tokens);
    for (const body of [{}, { linkToken: '' }, { linkToken: 'x'.repeat(201) }, { token: 'x' }]) {
      const res = await request(server())
        .post(`/api/v1/guest/collections/${collectionId}/session`)
        .set('Origin', ORIGIN)
        .send(body)
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    await exchange('not-a-uuid', 'x').expect(400);
  });

  test('resolve now returns the collection id for the exchange', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const res = await request(server())
      .post('/api/v1/guest/links/resolve')
      .set('Origin', ORIGIN)
      .send({ linkToken: link.token })
      .expect(200);
    expect(resolveGuestLinkResponseSchema.parse(res.body).collectionId).toBe(collectionId);
  });

  test('neither the link token nor the cookie value reaches the logs', async () => {
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const cookie = await joinAsGuest(server(), collectionId, link.token);
    await exchange(collectionId, link.token, cookie).expect(200);
    await context(collectionId, cookie).expect(200);
    expect(logs.output).toContain(`/api/v1/guest/collections/${collectionId}/session`);
    for (const secret of [link.token, cookie.slice('st_gs='.length)]) {
      expect(logs.output).not.toContain(secret);
    }
  });
});

describe('guest session exchange rate limit', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE: '2' }));
    await app.init();
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test('the third exchange in a minute → 429 RATE_LIMITED with Retry-After', async () => {
    await resetDatabase(prisma);
    const { collectionId, link } = await seedCollection(prisma, tokens);
    const exchange = () =>
      request(server())
        .post(`/api/v1/guest/collections/${collectionId}/session`)
        .set('Origin', ORIGIN)
        .send({ linkToken: link.token });
    await exchange().expect(200);
    await exchange().expect(200);
    const res = await exchange().expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});
