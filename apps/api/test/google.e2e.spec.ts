import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authMethodsResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  GOOGLE_IDENTITY,
  type GoogleClaims,
  type GoogleIdentity,
} from '../src/auth/google/google-identity.js';
import type { ApiEnv } from '../src/config/env.js';
import { configureApp } from '../src/create-app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();
const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' };

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
  await app.init();
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
      .query(query.returnTo === undefined ? {} : { returnTo: query.returnTo })
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
      magicLink: true,
      google: true,
      turnstileSiteKey: '1x00000000000000000000AA',
    });
  });

  test('/start redirects to Google and sets st_oauth with the required attributes', async () => {
    const res = await request(server()).get('/api/v1/auth/google/start').expect(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.example\/auth\?state=/);
    const line = setCookies(res).find((c) => c.startsWith('st_oauth=')) ?? '';
    expect(line).toMatch(/; Path=\/api\/v1\/auth\/google; Max-Age=600; HttpOnly; SameSite=Lax$/);
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

    const start = await request(server()).get('/api/v1/auth/google/start').expect(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    const oauth = cookieValue(start, 'st_oauth') ?? '';
    const [payload = ''] = oauth.split('.');
    const forged = `${payload}.${'A'.repeat(43)}`;
    const res = await request(server())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'good-code', state })
      .set('Cookie', `st_oauth=${forged}`)
      .expect(302);
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=OAUTH_FAILED`);
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
