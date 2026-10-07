import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { currentLegalVersions, meResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/tokens.js';
import type { ApiEnv } from '../src/config/env.js';
import { configureApp } from '../src/create-app.js';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from '../src/turnstile/turnstile-verifier.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { magicLinkToken, messagesAfter, messageText, waitForMessages } from './support/mailpit.js';

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();

/** Accepts the literal token `pass`, like a solved challenge. */
const turnstile: TurnstileVerifier = { verify: (token) => Promise.resolve(token === 'pass') };

async function buildApp(env: ApiEnv): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot({ env })] })
    .overrideProvider(TURNSTILE_VERIFIER)
    .useValue(turnstile)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, env);
  await listenOnLoopback(app);
  return app;
}

const newEmail = (): string => `ml-${randomUUID()}@stepler.test`;

describe('magic link sign-in', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  const requestLink = (email: string, extra: Record<string, unknown> = {}) =>
    request(server())
      .post('/api/v1/auth/magic-link')
      .set('Origin', ORIGIN)
      .send({ email, turnstileToken: 'pass', legal: currentLegalVersions(), ...extra });
  const preview = (token: string) =>
    request(server()).post('/api/v1/auth/magic-link/preview').set('Origin', ORIGIN).send({ token });
  const verify = (token: string, requestId?: string) => {
    const req = request(server()).post('/api/v1/auth/magic-link/verify').set('Origin', ORIGIN);
    if (requestId !== undefined) req.set('x-request-id', requestId);
    return req.send({ token });
  };
  const sessionOf = (res: request.Response): string =>
    res.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

  /** Requests a link and returns the token from the newest email (Mailpit lists newest first). */
  async function linkFor(email: string): Promise<string> {
    const before = (await messagesAfter(email, 0)).length;
    await requestLink(email).expect(202);
    const [newest] = await waitForMessages(email, before + 1);
    if (newest === undefined) throw new Error('no email');
    return magicLinkToken(newest.ID);
  }

  beforeAll(async () => {
    // Every test calls from 127.0.0.1; per-IP limits are covered in their own suite below.
    app = await buildApp(
      testEnv({
        LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: '10000',
        LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: '10000',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('happy path: request → email → preview → verify → session', async () => {
    const email = newEmail();
    const res = await requestLink(email).expect(202);
    expect(res.body).toEqual({ status: 'sent' });
    const [message] = await waitForMessages(email);
    expect(message?.Subject).toBe('Вхід до Stepler');
    const token = await magicLinkToken(message?.ID ?? '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect((await preview(token).expect(200)).body).toEqual({ email });

    const signedIn = await verify(token).expect(200);
    expect(signedIn.body).toEqual({ status: 'signed-in' });
    const cookie = signedIn.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(
      /^st_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/,
    );

    const me = await request(server())
      .get('/api/v1/me')
      .set('Cookie', cookie.split(';')[0] ?? '');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, locale: 'uk' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(await prisma.authAccount.count({ where: { userId: user.id, provider: 'EMAIL' } })).toBe(
      1,
    );
  });

  describe('legal acceptance at sign-in (ADR 0016)', () => {
    test('Review Focus 2 (a): no `legal` → 400 VALIDATION_FAILED, no row, no mail', async () => {
      const email = newEmail();
      const res = await request(server())
        .post('/api/v1/auth/magic-link')
        .set('Origin', ORIGIN)
        .send({ email, turnstileToken: 'pass' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await prisma.magicLinkToken.count()).toBe(0);
      expect(await messagesAfter(email, 300)).toHaveLength(0);
    });

    test('Review Focus 2 (a): a malformed version → 400 VALIDATION_FAILED', async () => {
      const res = await requestLink(newEmail(), {
        legal: { ...currentLegalVersions(), terms: '<script>' },
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await prisma.magicLinkToken.count()).toBe(0);
    });

    test('Review Focus 2 (a): a version that is not current → 400 LEGAL_VERSION_OUTDATED, no row, no mail', async () => {
      const email = newEmail();
      const res = await requestLink(email, {
        legal: { ...currentLegalVersions(), terms: 'v9' },
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'LEGAL_VERSION_OUTDATED' });
      expect(await prisma.magicLinkToken.count()).toBe(0);
      expect(await messagesAfter(email, 300)).toHaveLength(0);
    });

    test('a new address: the token row holds the versions; verify records both in its request', async () => {
      const email = newEmail();
      const token = await linkFor(email);
      const row = await prisma.magicLinkToken.findFirstOrThrow({ where: { email } });
      expect({ terms: row.legalTermsVersion, privacy: row.legalPrivacyVersion }).toEqual(
        currentLegalVersions(),
      );

      const signedIn = await verify(token, 'verify-req-0001').expect(200);
      const me = await request(server())
        .get('/api/v1/me')
        .set('Cookie', sessionOf(signedIn))
        .expect(200);
      expect(meResponseSchema.parse(me.body).legal.accepted).toBe(true);
      const rows = await prisma.legalAcceptance.findMany();
      expect(rows).toHaveLength(2);
      for (const acceptance of rows) expect(acceptance.requestId).toBe('verify-req-0001');
      await request(server())
        .get('/api/v1/collections')
        .set('Cookie', sessionOf(signedIn))
        .expect(200);
    });

    test('Review Focus 3: an accepted user signing in again keeps one row per document', async () => {
      const email = newEmail();
      await verify(await linkFor(email)).expect(200);
      await verify(await linkFor(email)).expect(200);
      expect(await prisma.legalAcceptance.count()).toBe(2);
    });

    test('Review Focus 2 (b): a link from before the checkbox signs in, records nothing and is gated', async () => {
      const email = newEmail();
      const token = await linkFor(email);
      // A pre-slice row: no versions.
      await prisma.magicLinkToken.updateMany({
        where: { email },
        data: { legalTermsVersion: null, legalPrivacyVersion: null },
      });
      const signedIn = await verify(token).expect(200);
      const cookie = sessionOf(signedIn);
      const me = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(meResponseSchema.parse(me.body).legal.accepted).toBe(false);
      const gated = await request(server()).get('/api/v1/collections').set('Cookie', cookie);
      expect(gated.status).toBe(403);
      expect(gated.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
      expect(await prisma.legalAcceptance.count()).toBe(0);
    });

    test('Review Focus 2 (b): a link whose versions went stale signs in, records nothing and is gated', async () => {
      const email = newEmail();
      const token = await linkFor(email);
      // Well-formed but not current: the registry moved on after the link was requested.
      await prisma.magicLinkToken.updateMany({
        where: { email },
        data: { legalTermsVersion: 'v9999', legalPrivacyVersion: 'v9999' },
      });
      const cookie = sessionOf(await verify(token).expect(200));
      expect(await prisma.legalAcceptance.count()).toBe(0);
      const me = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(meResponseSchema.parse(me.body).legal.accepted).toBe(false);
      const gated = await request(server()).get('/api/v1/collections').set('Cookie', cookie);
      expect(gated.status).toBe(403);
      expect(gated.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
    });

    test('the email tells the mailbox owner that signing in accepts both documents', async () => {
      const email = newEmail();
      await requestLink(email).expect(202);
      const [message] = await waitForMessages(email);
      const text = await messageText(message?.ID ?? '');
      expect(text).toContain('Продовжуючи, ви приймаєте Умови використання');
      expect(text).toContain('http://localhost:3000/legal/terms');
      expect(text).toContain('http://localhost:3000/legal/privacy');
    });

    test('the database refuses a malformed version on the token row', async () => {
      const email = newEmail();
      await linkFor(email);
      await expect(
        prisma.magicLinkToken.updateMany({ where: { email }, data: { legalTermsVersion: 'v0' } }),
      ).rejects.toThrow();
    });
  });

  test('the token is stored hashed and the request IP only as an HMAC', async () => {
    const email = newEmail();
    const token = await linkFor(email);
    const row = await prisma.magicLinkToken.findFirstOrThrow({ where: { email } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.requestIpHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.requestIpHash).not.toContain('127.0.0.1');
  });

  test('preview does not consume: 10 previews, then verify still succeeds', async () => {
    const token = await linkFor(newEmail());
    for (let i = 0; i < 10; i++) await preview(token).expect(200);
    await verify(token).expect(200);
    const after = await preview(token).expect(400);
    expect(after.body).toMatchObject({ code: 'MAGIC_LINK_INVALID' });
  });

  test('Review Focus 2: two concurrent verifies → exactly one session', async () => {
    const token = await linkFor(newEmail());
    const results = await Promise.all([verify(token), verify(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await prisma.authSession.count()).toBe(1);
  });

  test('a reused, expired or unknown token → 400 MAGIC_LINK_INVALID', async () => {
    const token = await linkFor(newEmail());
    await verify(token).expect(200);
    expect((await verify(token).expect(400)).body).toMatchObject({ code: 'MAGIC_LINK_INVALID' });

    const expired = await linkFor(newEmail());
    await prisma.magicLinkToken.updateMany({
      where: { consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await preview(expired).expect(400);
    await verify(expired).expect(400);

    await verify('A'.repeat(43)).expect(400);
  });

  test('Review Focus 3: unknown, existing and blocked emails get the same response', async () => {
    const existing = newEmail();
    const blocked = newEmail();
    await prisma.user.create({ data: { email: existing } });
    await prisma.user.create({
      data: { email: blocked, status: 'BLOCKED', blockedAt: new Date() },
    });

    const bodies = [];
    for (const email of [newEmail(), existing, blocked]) {
      const res = await requestLink(email);
      bodies.push({ status: res.status, body: res.body as unknown });
    }
    expect(bodies[0]).toEqual({ status: 202, body: { status: 'sent' } });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(await waitForMessages(existing)).toHaveLength(1);
    // [Q3] (slice 9): the blocked account's own mailbox learns why no link comes; no link.
    const [notice] = await waitForMessages(blocked);
    expect(notice?.Subject).toBe('Stepler: акаунт заблоковано');
    const text = await messageText(notice?.ID ?? '');
    expect(text).toContain('заблоковано');
    expect(text).not.toContain('/auth/verify');
    // Once an hour at most, however often it asks.
    await requestLink(blocked).expect(202);
    expect(await messagesAfter(blocked, 500)).toHaveLength(1);
  });

  test('a blocked user cannot verify a link issued before the block', async () => {
    const email = newEmail();
    const token = await linkFor(email);
    await verify(token).expect(200);
    const second = await linkFor(email);
    await prisma.user.update({
      where: { email },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
    expect((await verify(second).expect(403)).body).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
  });

  test('the 6th request for one email within an hour sends nothing but still returns 202', async () => {
    const email = newEmail();
    for (let i = 0; i < 6; i++) await requestLink(email).expect(202);
    expect(await waitForMessages(email, 5)).toHaveLength(5);
    expect(await messagesAfter(email, 500)).toHaveLength(5);
  });

  test('Turnstile failure → 400 TURNSTILE_FAILED and no email', async () => {
    const email = newEmail();
    const res = await requestLink(email, { turnstileToken: 'fail' }).expect(400);
    expect(res.body).toMatchObject({ code: 'TURNSTILE_FAILED' });
    expect(await messagesAfter(email, 300)).toHaveLength(0);
  });

  test('Review Focus 5: differently cased emails are one user', async () => {
    const id = randomUUID();
    await verify(await linkFor(` Anton-${id}@Example.COM `)).expect(200);
    await verify(await linkFor(`anton-${id}@example.com`)).expect(200);
    expect(await prisma.user.count()).toBe(1);
  });

  test("the email follows the existing user's locale over the request locale", async () => {
    const email = newEmail();
    await prisma.user.create({ data: { email, locale: 'en' } });
    await requestLink(email, { locale: 'uk' }).expect(202);
    const [message] = await waitForMessages(email);
    expect(message?.Subject).toBe('Sign in to Stepler');

    const fresh = newEmail();
    await requestLink(fresh, { locale: 'en' }).expect(202);
    expect((await waitForMessages(fresh))[0]?.Subject).toBe('Sign in to Stepler');
  });

  test('a new user gets the locale the link was requested with', async () => {
    const email = newEmail();
    await requestLink(email, { locale: 'en' }).expect(202);
    const [message] = await waitForMessages(email);
    await verify(await magicLinkToken(message?.ID ?? '')).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).locale).toBe('en');
  });

  test('verify replaces an existing session instead of keeping both', async () => {
    const email = newEmail();
    const first = await verify(await linkFor(email)).expect(200);
    const firstCookie = first.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    const secondToken = await linkFor(email);
    await request(server())
      .post('/api/v1/auth/magic-link/verify')
      .set('Origin', ORIGIN)
      .set('Cookie', firstCookie)
      .send({ token: secondToken })
      .expect(200);
    await request(server()).get('/api/v1/me').set('Cookie', firstCookie).expect(401);
    expect(await prisma.authSession.count()).toBe(1);
  });

  test('login CSRF: a cross-site verify is rejected before the token is used', async () => {
    const token = await linkFor(newEmail());
    const res = await request(server())
      .post('/api/v1/auth/magic-link/verify')
      .set('Origin', 'https://evil.example')
      .send({ token })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    await preview(token).expect(200);
  });
});

describe('magic link per-IP limits', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await buildApp(
      testEnv({
        LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: '2',
        LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: '2',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  test('exceeding the request limit → 429 RATE_LIMITED with Retry-After', async () => {
    const send = () =>
      request(server())
        .post('/api/v1/auth/magic-link')
        .set('Origin', ORIGIN)
        .send({ email: newEmail(), turnstileToken: 'pass', legal: currentLegalVersions() });
    await send().expect(202);
    await send().expect(202);
    const res = await send().expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('requests with a failed Turnstile check or outdated legal versions do not use up the IP limit', async () => {
    // Fresh counters: the previous test filled this IP's bucket.
    await app.close();
    app = await buildApp(
      testEnv({
        LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: '2',
        LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: '2',
      }),
    );
    const send = (turnstileToken: string) =>
      request(server())
        .post('/api/v1/auth/magic-link')
        .set('Origin', ORIGIN)
        .send({ email: newEmail(), turnstileToken, legal: currentLegalVersions() });
    // Anyone can send junk tokens; they must not lock out real users behind the same IP.
    for (let i = 0; i < 5; i++) await send('junk').expect(400);
    // Nor can a stale or bypassed sign-in card (outdated legal versions).
    for (let i = 0; i < 5; i++) {
      await request(server())
        .post('/api/v1/auth/magic-link')
        .set('Origin', ORIGIN)
        .send({
          email: newEmail(),
          turnstileToken: 'pass',
          legal: { ...currentLegalVersions(), terms: 'v9' },
        })
        .expect(400);
    }
    await send('pass').expect(202);
    await send('pass').expect(202);
    await send('pass').expect(429);
  });

  test('the preview limit is separate from the request limit', async () => {
    const send = () =>
      request(server())
        .post('/api/v1/auth/magic-link/preview')
        .set('Origin', ORIGIN)
        .send({ token: 'A'.repeat(43) });
    await send().expect(400);
    await send().expect(400);
    await send().expect(429);
  });
});
