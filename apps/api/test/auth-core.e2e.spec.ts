import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { legalStatus, meResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { SessionService } from '../src/auth/session.service.js';
import { hashToken } from '../src/auth/tokens.js';
import { createApp } from '../src/create-app.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();

describe('auth core', () => {
  let app: INestApplication;
  let sessions: SessionService;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: 'op@stepler.test' }));
    await listenOnLoopback(app);
    sessions = app.get(SessionService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const signedIn = (email = 'a@stepler.test', verified = true) =>
    signInAs(app, prisma, email, verified);

  test('no cookie → 401 UNAUTHENTICATED', async () => {
    const res = await request(server()).get('/api/v1/me').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  test('an unknown or malformed cookie → 401', async () => {
    await request(server()).get('/api/v1/me').set('Cookie', 'st_session=nope').expect(401);
    await request(server())
      .get('/api/v1/me')
      .set('Cookie', `st_session=${'A'.repeat(43)}`)
      .expect(401);
  });

  test('a valid cookie → 200 with the contract body', async () => {
    const { cookie, userId } = await signedIn();
    const res = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
    expect(meResponseSchema.parse(res.body)).toEqual({
      id: userId,
      email: 'a@stepler.test',
      displayName: null,
      locale: 'uk',
      isOperator: false,
      hasPassword: false,
      legal: expect.objectContaining({ accepted: true }) as unknown,
    });
    const body = meResponseSchema.parse(res.body);
    expect(body.legal.documents.map((d) => d.acceptedVersion)).toEqual(
      legalStatus([]).documents.map((d) => d.requiredVersion),
    );
  });

  test('the database stores only the token hash', async () => {
    const { cookie } = await signedIn();
    const token = cookie.split('=')[1] ?? '';
    const [row] = await prisma.authSession.findMany();
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(row?.tokenHash).not.toContain(token);
  });

  test('an expired session → 401', async () => {
    const { cookie } = await signedIn();
    await prisma.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(401);
  });

  test('a blocked user → 401', async () => {
    const { cookie, userId } = await signedIn();
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(401);
  });

  test('lastUsedAt is refreshed at most once per hour', async () => {
    const { cookie } = await signedIn();
    const stale = new Date(Date.now() - 2 * 3600_000);
    await prisma.authSession.updateMany({ data: { lastUsedAt: stale } });
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
    const refreshed = (await prisma.authSession.findFirstOrThrow()).lastUsedAt;
    expect(refreshed.getTime()).toBeGreaterThan(stale.getTime());
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
    expect((await prisma.authSession.findFirstOrThrow()).lastUsedAt).toEqual(refreshed);
  });

  describe('CSRF origin check on unsafe methods', () => {
    test('PATCH /me without Origin → 403 CSRF_ORIGIN_MISMATCH', async () => {
      const { cookie } = await signedIn();
      const res = await request(server())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .send({ locale: 'en' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    });

    test('PATCH /me from another origin → 403', async () => {
      const { cookie } = await signedIn();
      await request(server())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .send({ locale: 'en' })
        .expect(403);
    });

    test('PATCH /me from APP_ORIGIN → 200 and updates the profile', async () => {
      const { cookie } = await signedIn();
      const res = await request(server())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ displayName: '  Anton ', locale: 'en' })
        .expect(200);
      expect(res.body).toMatchObject({ displayName: 'Anton', locale: 'en' });
      const cleared = await request(server())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ displayName: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ displayName: null, locale: 'en' });
    });

    test('PATCH /me rejects an empty, too long or control-character display name', async () => {
      const { cookie } = await signedIn();
      for (const displayName of ['   ', 'x'.repeat(81), 'Anton\nK', 'A\u0000']) {
        const res = await request(server())
          .patch('/api/v1/me')
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .send({ displayName })
          .expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      const me = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(me.body).toMatchObject({ displayName: null });
    });

    test('PATCH /me validates the body', async () => {
      const { cookie } = await signedIn();
      const res = await request(server())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ email: 'x@y.io' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    test('an unauthenticated unsafe request from another origin is rejected by CSRF first', async () => {
      const res = await request(server())
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    });
  });

  test('logout → 204, clears the cookie, then the same cookie → 401', async () => {
    const { cookie } = await signedIn();
    const res = await request(server())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^st_session=; .*Max-Age=0/);
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(401);
    expect(await prisma.authSession.count()).toBe(0);
  });

  test('logout without a session is idempotent', async () => {
    await request(server()).post('/api/v1/auth/logout').set('Origin', ORIGIN).expect(204);
  });

  test('an email in OPERATOR_EMAILS is an operator only when verified', async () => {
    const verified = await signedIn('op@stepler.test', true);
    const me = await request(server()).get('/api/v1/me').set('Cookie', verified.cookie);
    expect(me.body).toMatchObject({ isOperator: true });

    await resetDatabase(prisma);
    const unverified = await signedIn('OP@stepler.test', false);
    const me2 = await request(server()).get('/api/v1/me').set('Cookie', unverified.cookie);
    expect(me2.body).toMatchObject({ isOperator: false });
  });

  test('health stays public', async () => {
    await request(server()).get('/api/v1/health/live').expect(200);
    await request(server()).get('/api/v1/health/ready').expect(200);
  });

  test('revokeAllForUser ends every session of that user', async () => {
    const { cookie, userId } = await signedIn();
    const second = await sessions.create(userId);
    await sessions.revokeAllForUser(userId);
    await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(401);
    await request(server())
      .get('/api/v1/me')
      .set('Cookie', `st_session=${second.token}`)
      .expect(401);
  });
});
