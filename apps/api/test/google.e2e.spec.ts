import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  authMethodsResponseSchema,
  currentLegalVersions,
  meResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  GOOGLE_IDENTITY,
  type GoogleClaims,
  type GoogleIdentity,
} from '../src/auth/google/google-identity.js';
import { encodeTransaction } from '../src/auth/google/oauth-cookie.js';
import type { ApiEnv } from '../src/config/env.js';
import { configureApp } from '../src/create-app.js';
import { deriveKey } from '../src/crypto/keys.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();
const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' };
/** What the sign-in card appends to the Google start link once its checkbox is ticked. */
const LEGAL_QUERY = currentLegalVersions();

/** Records the verifier it was given and returns whatever claims the test sets. */
class FakeGoogle implements GoogleIdentity {
  claims: GoogleClaims = { sub: 'g-1', email: 'g@stepler.test', emailVerified: true };
  lastVerifier: string | undefined;
  authorizationUrl(state: string, codeVerifier: string): URL {
    this.lastVerifier = codeVerifier;
    return new URL(`https://accounts.example/auth?state=${state}`);
  }
  exchange(code: string, codeVerifier: string): Promise<GoogleClaims> {
    if (code !== 'good-code' || codeVerifier !== this.lastVerifier) {
      return Promise.reject(new Error('invalid_grant'));
    }
    return Promise.resolve(this.claims);
  }
}

async function buildApp(env: ApiEnv, google?: GoogleIdentity): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot({ env })] });
  if (google !== undefined) builder = builder.overrideProvider(GOOGLE_IDENTITY).useValue(google);
  const app = (await builder.compile()).createNestApplication({ bufferLogs: true });
  configureApp(app, env);
  await listenOnLoopback(app);
  return app;
}

/** supertest types `set-cookie` as a string; at runtime it is an array. */
function setCookies(res: request.Response): string[] {
  const value = res.headers['set-cookie'] as unknown;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' ? [value] : [];
}

function cookieValue(res: request.Response, name: string): string | undefined {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.slice(name.length + 1);
}

describe('Google sign-in', () => {
  let app: INestApplication;
  const google = new FakeGoogle();
  const server = (): Server => app.getHttpServer() as Server;

  /** Runs /start, then the callback with the state Google would send back. */
  async function signIn(query: { returnTo?: string; code?: string; state?: string } = {}) {
    const start = await request(server())
      .get('/api/v1/auth/google/start')
      .query({
        ...LEGAL_QUERY,
        ...(query.returnTo === undefined ? {} : { returnTo: query.returnTo }),
      })
      .expect(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    const oauth = cookieValue(start, 'st_oauth') ?? '';
    return request(server())
      .get('/api/v1/auth/google/callback')
      .query({ code: query.code ?? 'good-code', state: query.state ?? state })
      .set('Cookie', `st_oauth=${oauth}`)
      .expect(302);
  }

  beforeAll(async () => {
    app = await buildApp(testEnv(GOOGLE_ENV), google);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    google.claims = {
      sub: `g-${randomUUID()}`,
      email: `g-${randomUUID()}@stepler.test`,
      emailVerified: true,
    };
  });

  test('/auth/methods reflects the configuration', async () => {
    const res = await request(server()).get('/api/v1/auth/methods').expect(200);
    expect(authMethodsResponseSchema.parse(res.body)).toEqual({
      password: true,
      google: true,
      turnstileSiteKey: '1x00000000000000000000AA',
      legal: currentLegalVersions(),
    });
  });

  test('/start redirects to Google and sets st_oauth with the required attributes', async () => {
    const res = await request(server())
      .get('/api/v1/auth/google/start')
      .query(LEGAL_QUERY)
      .expect(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.example\/auth\?state=/);
    const line = setCookies(res).find((c) => c.startsWith('st_oauth=')) ?? '';
    expect(line).toMatch(/; Path=\/api\/v1\/auth\/google; Max-Age=600; HttpOnly; SameSite=Lax$/);
  });

  describe('legal acceptance at sign-in (ADR 0016)', () => {
    test('Review Focus 2 (a): /start with incomplete or malformed versions → back to /login, no st_oauth cookie', async () => {
      for (const query of [{ terms: LEGAL_QUERY.terms }, { terms: '<script>', privacy: 'v1' }]) {
        const res = await request(server())
          .get('/api/v1/auth/google/start')
          .query(query)
          .expect(302);
        expect(res.headers.location).toBe(`${ORIGIN}/login?error=LEGAL_ACCEPTANCE_REQUIRED`);
        expect(setCookies(res).some((c) => c.startsWith('st_oauth='))).toBe(false);
      }
    });

    test('from the sign-in form /start carries no versions: Google is asked, nothing is recorded (ADR 0019)', async () => {
      const start = await request(server()).get('/api/v1/auth/google/start').expect(302);
      expect(start.headers.location).toMatch(/^https:\/\/accounts\.example\/auth\?state=/);
      const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
      const callback = await request(server())
        .get('/api/v1/auth/google/callback')
        .query({ code: 'good-code', state })
        .set('Cookie', `st_oauth=${cookieValue(start, 'st_oauth') ?? ''}`)
        .expect(302);
      expect(callback.headers.location).toBe(`${ORIGIN}/app`);
      expect(await prisma.legalAcceptance.count()).toBe(0);
    });

    test('a registered but unconfirmed address: Google confirms it and drops the unproven password', async () => {
      const pending = await prisma.user.create({
        data: {
          email: google.claims.email,
          passwordCredential: { create: { passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$x$y' } },
        },
      });
      await signIn();
      expect(await prisma.passwordCredential.count({ where: { userId: pending.id } })).toBe(0);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.trialEndsAt).not.toBeNull();
    });

    test('Review Focus 2 (a): /start with a version that is not current → LEGAL_VERSION_OUTDATED', async () => {
      const res = await request(server())
        .get('/api/v1/auth/google/start')
        .query({ ...LEGAL_QUERY, terms: 'v9' })
        .expect(302);
      expect(res.headers.location).toBe(`${ORIGIN}/login?error=LEGAL_VERSION_OUTDATED`);
      expect(setCookies(res).some((c) => c.startsWith('st_oauth='))).toBe(false);
    });

    test('a start launched from another site is refused; same-site, none and no header pass', async () => {
      const crossSite = await request(server())
        .get('/api/v1/auth/google/start')
        .query(LEGAL_QUERY)
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(302);
      expect(crossSite.headers.location).toBe(`${ORIGIN}/login?error=LEGAL_ACCEPTANCE_REQUIRED`);
      expect(setCookies(crossSite).some((c) => c.startsWith('st_oauth='))).toBe(false);

      for (const site of ['same-origin', 'same-site', 'none', undefined]) {
        const req = request(server()).get('/api/v1/auth/google/start').query(LEGAL_QUERY);
        if (site !== undefined) req.set('Sec-Fetch-Site', site);
        const res = await req.expect(302);
        expect(res.headers.location).toMatch(/^https:\/\/accounts\.example\/auth\?state=/);
      }
    });

    test('the signed transaction carries the versions', async () => {
      const res = await request(server())
        .get('/api/v1/auth/google/start')
        .query(LEGAL_QUERY)
        .expect(302);
      const [payload = ''] = (cookieValue(res, 'st_oauth') ?? '').split('.');
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
      expect(decoded).toMatchObject({ legal: currentLegalVersions() });
    });

    test('a new user is accepted at the callback, in its request', async () => {
      const start = await request(server())
        .get('/api/v1/auth/google/start')
        .query(LEGAL_QUERY)
        .expect(302);
      const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
      const res = await request(server())
        .get('/api/v1/auth/google/callback')
        .query({ code: 'good-code', state })
        .set('Cookie', `st_oauth=${cookieValue(start, 'st_oauth') ?? ''}`)
        .set('x-request-id', 'callback-req-0001')
        .expect(302);
      const session = cookieValue(res, 'st_session');
      const me = await request(server())
        .get('/api/v1/me')
        .set('Cookie', `st_session=${session}`)
        .expect(200);
      expect(meResponseSchema.parse(me.body).legal.accepted).toBe(true);
      const rows = await prisma.legalAcceptance.findMany();
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.requestId).toBe('callback-req-0001');
    });

    test('Review Focus 3: an accepted user signing in again keeps one row per document', async () => {
      await signIn();
      await signIn();
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.legalAcceptance.count()).toBe(2);
    });

    test('a linked-by-email existing user without rows is accepted at the Google sign-in', async () => {
      const existing = await prisma.user.create({
        data: { email: google.claims.email, emailVerifiedAt: new Date() },
      });
      await signIn();
      expect(await prisma.legalAcceptance.count({ where: { userId: existing.id } })).toBe(2);
    });

    test('Review Focus 2 (b): a transaction whose versions went stale signs in, records nothing, is gated', async () => {
      // A transaction signed when other versions were current (valid format, not current now).
      const key = deriveKey(testEnv(GOOGLE_ENV).APP_SECRET, 'st_oauth');
      google.lastVerifier = 'stale-verifier';
      const cookie = encodeTransaction(key, {
        state: 'stale-state',
        codeVerifier: 'stale-verifier',
        returnTo: '/app',
        legal: { terms: 'v9999', privacy: 'v9999' },
      });
      const res = await request(server())
        .get('/api/v1/auth/google/callback')
        .query({ code: 'good-code', state: 'stale-state' })
        .set('Cookie', `st_oauth=${cookie}`)
        .expect(302);
      expect(res.headers.location).toBe(`${ORIGIN}/app`);
      const session = `st_session=${cookieValue(res, 'st_session') ?? ''}`;
      expect(await prisma.legalAcceptance.count()).toBe(0);
      const me = await request(server()).get('/api/v1/me').set('Cookie', session).expect(200);
      expect(meResponseSchema.parse(me.body).legal.accepted).toBe(false);
      const gated = await request(server()).get('/api/v1/collections').set('Cookie', session);
      expect(gated.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
    });
  });

  test('a new sub and email → user created, session set, 302 to /app', async () => {
    const res = await signIn();
    expect(res.headers.location).toBe(`${ORIGIN}/app`);
    const session = cookieValue(res, 'st_session');
    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookies(res).some((c) => /^st_oauth=; .*Max-Age=0/.test(c))).toBe(true);
    const me = await request(server()).get('/api/v1/me').set('Cookie', `st_session=${session}`);
    expect(me.body).toMatchObject({ email: google.claims.email });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: google.claims.email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    // A new account starts its 7-day trial (ADR 0018).
    expect(user.trialEndsAt?.getTime()).toBe(user.createdAt.getTime() + 7 * 24 * 3600_000);
  });

  test('the same Google account signs in to the same user again', async () => {
    await signIn();
    google.claims = { ...google.claims, email: `renamed-${randomUUID()}@stepler.test` };
    const res = await signIn();
    expect(res.headers.location).toBe(`${ORIGIN}/app`);
    expect(await prisma.user.count()).toBe(1);
  });

  test('Review Focus 5: a verified Google email links to the existing user, case-insensitively', async () => {
    const existing = await prisma.user.create({
      data: { email: 'anton@stepler.test', emailVerifiedAt: new Date() },
    });
    google.claims = { sub: 'g-anton', email: 'Anton@Stepler.TEST', emailVerified: true };
    await signIn();
    expect(await prisma.user.count()).toBe(1);
    const account = await prisma.authAccount.findFirstOrThrow({ where: { provider: 'GOOGLE' } });
    expect(account.userId).toBe(existing.id);
  });

  test('the Google name fills an empty display name once and never overwrites one', async () => {
    // An e-mail user without a name signs in with Google: the verified name is taken.
    const plain = await prisma.user.create({
      data: { email: 'olia@stepler.test', emailVerifiedAt: new Date() },
    });
    google.claims = {
      sub: 'g-olia',
      email: 'olia@stepler.test',
      emailVerified: true,
      name: '  Оля\u0007 Коваль  ',
    };
    await signIn();
    // Trimmed, control characters dropped.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: plain.id } })).displayName).toBe(
      'Оля Коваль',
    );

    // A name the user set (or an earlier one) stays, on the linked path too.
    await prisma.user.update({ where: { id: plain.id }, data: { displayName: 'Ольга' } });
    google.claims = { ...google.claims, name: 'Olia K.' };
    await signIn();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: plain.id } })).displayName).toBe(
      'Ольга',
    );

    // Cleared by the user, the next Google sign-in fills it again.
    await prisma.user.update({ where: { id: plain.id }, data: { displayName: null } });
    await signIn();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: plain.id } })).displayName).toBe(
      'Olia K.',
    );
  });

  test('a new Google user gets the name, cut to 80 characters; a blank name leaves it empty', async () => {
    google.claims = { ...google.claims, name: 'Я'.repeat(90) };
    await signIn();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: google.claims.email } });
    expect(user.displayName).toBe('Я'.repeat(80));

    google.claims = {
      sub: `g-${randomUUID()}`,
      email: `g-${randomUUID()}@stepler.test`,
      emailVerified: true,
      name: '   ',
    };
    await signIn();
    const blank = await prisma.user.findUniqueOrThrow({ where: { email: google.claims.email } });
    expect(blank.displayName).toBeNull();
  });

  test('Review Focus 5: an unverified Google email never links or creates an account', async () => {
    await prisma.user.create({ data: { email: 'victim@stepler.test' } });
    google.claims = { sub: 'g-attacker', email: 'victim@stepler.test', emailVerified: false };
    const res = await signIn();
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);
    expect(await prisma.authAccount.count()).toBe(0);
    expect(cookieValue(res, 'st_session')).toBeUndefined();

    google.claims = { sub: 'g-new', email: 'nobody@stepler.test', emailVerified: false };
    await signIn();
    expect(await prisma.user.count()).toBe(1);
  });

  test('a mismatched state → OAUTH_FAILED and no session', async () => {
    const res = await signIn({ state: 'forged-state' });
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);
    expect(cookieValue(res, 'st_session')).toBeUndefined();
    expect(await prisma.authSession.count()).toBe(0);
  });

  test('a missing or tampered st_oauth cookie → OAUTH_FAILED', async () => {
    const noCookie = await request(server())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'good-code', state: 'x' })
      .expect(302);
    expect(noCookie.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);

    const start = await request(server())
      .get('/api/v1/auth/google/start')
      .query(LEGAL_QUERY)
      .expect(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    const oauth = cookieValue(start, 'st_oauth') ?? '';
    const [payload = '', signature = ''] = oauth.split('.');
    const forged = `${payload}.${'A'.repeat(43)}`;
    const res = await request(server())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'good-code', state })
      .set('Cookie', `st_oauth=${forged}`)
      .expect(302);
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);

    // The legal versions ride inside the signed payload: editing them breaks the signature.
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const edited = Buffer.from(
      JSON.stringify({ ...decoded, legal: { terms: 'v9', privacy: 'v9' } }),
    ).toString('base64url');
    const tampered = await request(server())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'good-code', state })
      .set('Cookie', `st_oauth=${edited}.${signature}`)
      .expect(302);
    expect(tampered.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);
    expect(await prisma.legalAcceptance.count()).toBe(0);
  });

  test('a failed code exchange or a provider error → OAUTH_FAILED', async () => {
    expect((await signIn({ code: 'bad-code' })).headers.location).toBe(
      `${ORIGIN}/login?error=OAUTH_FAILED`,
    );
    const denied = await request(server())
      .get('/api/v1/auth/google/callback')
      .query({ error: 'access_denied' })
      .expect(302);
    expect(denied.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);
  });

  test('a blocked user → ACCOUNT_BLOCKED and no session', async () => {
    await signIn();
    await prisma.user.updateMany({ data: { status: 'BLOCKED', blockedAt: new Date() } });
    const res = await signIn();
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=ACCOUNT_BLOCKED`);
    expect(cookieValue(res, 'st_session')).toBeUndefined();
  });

  test('returnTo: /app paths are kept, anything else falls back to /app', async () => {
    expect((await signIn({ returnTo: '/app/collections' })).headers.location).toBe(
      `${ORIGIN}/app/collections`,
    );
    for (const returnTo of [
      'https://evil.example',
      '//evil.example',
      '/application',
      '/app\\evil',
      '/login',
    ]) {
      expect((await signIn({ returnTo })).headers.location).toBe(`${ORIGIN}/app`);
    }
  });
});

describe('Google sign-in not configured', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(testEnv());
  });

  afterAll(async () => {
    await app.close();
  });

  test('/start → 404 and methods.google is false', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/api/v1/auth/google/start').expect(404);
    await request(server).get('/api/v1/auth/google/callback').expect(404);
    const res = await request(server).get('/api/v1/auth/methods').expect(200);
    expect(res.body).toMatchObject({ google: false });
  });
});
