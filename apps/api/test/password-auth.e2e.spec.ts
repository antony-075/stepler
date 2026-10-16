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
import { mailedToken, messagesAfter, messageText, waitForMessages } from './support/mailpit.js';
import { givePassword } from './support/sessions.js';

// E-mail + password accounts (ADR 0019): register → confirm → sign in; one answer for an unknown
// address and a wrong password; failure limits; single-use expiring reset links that end every
// session; the password change. Mail goes through the local Mailpit.

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();
const PASSWORD = 'Pa55word!';
const OTHER = 'An0ther-one';

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

const newEmail = (): string => `pw-${randomUUID()}@stepler.test`;
const sessionOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';

describe('e-mail + password accounts', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;
  const post = (path: string, body: object, cookie?: string) => {
    const req = request(server()).post(`/api/v1/auth${path}`).set('Origin', ORIGIN);
    if (cookie !== undefined) req.set('Cookie', cookie);
    return req.send(body);
  };
  const register = (email: string, password = PASSWORD, extra: object = {}) =>
    post('/register', {
      email,
      password,
      turnstileToken: 'pass',
      legal: currentLegalVersions(),
      ...extra,
    });
  const login = (email: string, password = PASSWORD) => post('/login', { email, password });
  const me = (cookie: string) => request(server()).get('/api/v1/me').set('Cookie', cookie);

  /** Waits for the address's next mail and returns its link token. */
  async function nextToken(email: string, before: number): Promise<string> {
    const messages = await waitForMessages(email, before + 1);
    return mailedToken(messages[0]?.ID ?? '');
  }

  /** A confirmed account with a password, through the real routes. */
  async function confirmed(email: string): Promise<string> {
    await register(email).expect(202);
    const token = await nextToken(email, 0);
    return sessionOf(await post('/verification/confirm', { token }).expect(200));
  }

  beforeAll(async () => {
    app = await buildApp(
      testEnv({
        LIMIT_LOGIN_FAILURES_PER_ADDRESS_IP_PER_15_MIN: '3',
        LIMIT_AUTH_EMAILS_PER_IP_PER_HOUR: '1000',
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

  test('register → the confirmation mail → preview → confirm → signed in, trial started', async () => {
    const email = newEmail();
    expect((await register(email).expect(202)).body).toEqual({ status: 'sent' });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { passwordCredential: true, legalAcceptances: true },
    });
    expect(user).toMatchObject({ emailVerifiedAt: null, trialEndsAt: null });
    // Only an Argon2id PHC string is stored, never the password.
    expect(user.passwordCredential?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.passwordCredential?.passwordHash).not.toContain(PASSWORD);
    expect(user.legalAcceptances).toHaveLength(2);

    // Not before the address is confirmed: the right password says so, nothing else.
    expect((await login(email).expect(403)).body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    const token = await nextToken(email, 0);
    expect(await prisma.authEmailToken.count({ where: { tokenHash: hashToken(token) } })).toBe(1);
    expect((await post('/verification/preview', { token }).expect(200)).body).toEqual({ email });
    const confirmedRes = await post('/verification/confirm', { token }).expect(200);
    expect(confirmedRes.body).toEqual({ status: 'signed-in' });
    const body = meResponseSchema.parse((await me(sessionOf(confirmedRes)).expect(200)).body);
    expect(body).toMatchObject({ email, hasPassword: true });
    expect(body.legal.accepted).toBe(true);
    const verified = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(verified.emailVerifiedAt).not.toBeNull();
    expect(verified.trialEndsAt).not.toBeNull();

    // Single use.
    expect((await post('/verification/confirm', { token }).expect(400)).body).toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
    await me(sessionOf(await login(email).expect(200))).expect(200);
  });

  test('an unknown address and a wrong password get the same answer', async () => {
    const email = newEmail();
    await confirmed(email);
    const wrong = await login(email, OTHER).expect(401);
    const unknown = await login(newEmail(), OTHER).expect(401);
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    // The whole problem body is the same, apart from the request id.
    const shape = (body: unknown) => {
      const rest = { ...(body as Record<string, unknown>) };
      delete rest.requestId;
      return rest;
    };
    expect(shape(unknown.body)).toEqual(shape(wrong.body));
    expect(sessionOf(wrong)).toBe('');
  });

  test('failures are limited per address and IP: 429, even for the right password', async () => {
    const email = newEmail();
    await confirmed(email);
    for (let i = 0; i < 3; i += 1) await login(email, OTHER).expect(401);
    const limited = await login(email).expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    // Another address is not affected.
    const other = newEmail();
    await confirmed(other);
    await login(other).expect(200);
  });

  test('registering a confirmed address: the same 202, a notice, the password unchanged', async () => {
    const email = newEmail();
    await confirmed(email);
    const before = (await messagesAfter(email, 0)).length;
    await register(email, OTHER).expect(202);
    const [notice] = await waitForMessages(email, before + 1);
    expect(await messageText(notice?.ID ?? '')).toMatch(/already exists|вже є/);
    await login(email).expect(200);
    await login(email, OTHER).expect(401);
  });

  test('registering an unconfirmed address again replaces its unproven password', async () => {
    const email = newEmail();
    await register(email).expect(202);
    await register(email, OTHER).expect(202);
    const token = await nextToken(email, 1);
    await post('/verification/confirm', { token }).expect(200);
    await login(email, OTHER).expect(200);
    await login(email).expect(401);
  });

  test('registration validates the rules, the legal box and Turnstile', async () => {
    const email = newEmail();
    expect((await register(email, 'weakpass').expect(400)).body).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(
      (await register(email, PASSWORD, { legal: { terms: 'v9999', privacy: 'v9999' } }).expect(400))
        .body,
    ).toMatchObject({ code: 'LEGAL_VERSION_OUTDATED' });
    expect(
      (await register(email, PASSWORD, { turnstileToken: 'nope' }).expect(400)).body,
    ).toMatchObject({ code: 'TURNSTILE_FAILED' });
    expect(await prisma.user.count()).toBe(0);
  });

  test('a reset link sets the password, ends every session, signs in, works once', async () => {
    const email = newEmail();
    const firstSession = await confirmed(email);
    const before = (await messagesAfter(email, 0)).length;
    await post('/password/forgot', { email, turnstileToken: 'pass' }).expect(202);
    const token = await nextToken(email, before);

    const reset = await post('/password/reset', { token, password: OTHER }).expect(200);
    await me(firstSession).expect(401);
    await me(sessionOf(reset)).expect(200);
    await login(email, OTHER).expect(200);
    await login(email).expect(401);
    expect(
      (await post('/password/reset', { token, password: OTHER }).expect(400)).body,
    ).toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });

  test('an expired reset link is refused; an unknown address mails nothing', async () => {
    const email = newEmail();
    await confirmed(email);
    const before = (await messagesAfter(email, 0)).length;
    await post('/password/forgot', { email, turnstileToken: 'pass' }).expect(202);
    const token = await nextToken(email, before);
    await prisma.authEmailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await post('/password/reset', { token, password: OTHER }).expect(400);

    const tokens = await prisma.authEmailToken.count();
    const nobody = newEmail();
    expect(
      (await post('/password/forgot', { email: nobody, turnstileToken: 'pass' }).expect(202)).body,
    ).toEqual({ status: 'sent' });
    expect(await prisma.authEmailToken.count()).toBe(tokens);
  });

  test('an account from Google sets its first password through «Забули пароль?»', async () => {
    const email = newEmail();
    await prisma.user.create({ data: { email, emailVerifiedAt: new Date() } });
    await login(email).expect(401);
    await post('/password/forgot', { email, turnstileToken: 'pass' }).expect(202);
    const token = await nextToken(email, 0);
    await post('/password/reset', { token, password: PASSWORD }).expect(200);
    await login(email).expect(200);
  });

  test('the password change needs the current one and ends the other sessions', async () => {
    const email = newEmail();
    const current = await confirmed(email);
    const other = sessionOf(await login(email).expect(200));
    expect(
      (await post('/password', { currentPassword: OTHER, newPassword: OTHER }, current).expect(400))
        .body,
    ).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    await post('/password', { currentPassword: PASSWORD, newPassword: OTHER }, current).expect(204);
    await me(current).expect(200);
    await me(other).expect(401);
    await login(email, OTHER).expect(200);
    const actions = await prisma.auditEvent.findMany({
      where: { action: { startsWith: 'account.' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual([
      'account.register',
      'account.email_verify',
      'account.password_change',
    ]);
  });

  test('a password set by the helper works like one set through the routes', async () => {
    const email = newEmail();
    const user = await prisma.user.create({ data: { email, emailVerifiedAt: new Date() } });
    await givePassword(app, prisma, user.id, PASSWORD);
    await login(email).expect(200);
  });
});
