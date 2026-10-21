import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  accountDeletionPreviewResponseSchema,
  checkoutResponseSchema,
  currentLegalVersion,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { deletedAddress } from '../src/users/account-deletion.service.js';
import { listenOnLoopback } from './support/app.js';
import {
  liqpayEnv,
  priceSubscriptions,
  signedCallback,
  type SubscriptionPrices,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { mailedToken, messagesAfter, waitForMessages } from './support/mailpit.js';
import { givePassword, signInAs } from './support/sessions.js';

// Self-service account deletion (ADR 0020): «Видалити акаунт» mails a one-time link to the
// account's own address; the link deletes every collection (the usual purge), the sign-in
// methods and sessions, and anonymises the user, whose payments stay. LiqPay must confirm
// stopping a subscription first, or nothing is deleted.

const OPERATOR = 'op@stepler.test';
const PASSWORD = 'Pa55word!';
const TERMS = currentLegalVersion('TERMS').version;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

let app: INestApplication;
let server: Server;
let prices: SubscriptionPrices;
let sequence = 0;

beforeAll(async () => {
  await stub.start();
  app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR, ...liqpayEnv(stub.base) }));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await stub.stop();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  stub.reset();
  prices = await priceSubscriptions(prisma);
});

const newEmail = (): string => `del-${Date.now()}-${++sequence}@stepler.test`;
const me = (cookie: string) => request(server).get('/api/v1/me').set('Cookie', cookie);
const ask = (cookie: string) =>
  request(server).post('/api/v1/me/deletion').set('Origin', ORIGIN).set('Cookie', cookie).send();
const preview = (token: string) =>
  request(server)
    .post('/api/v1/auth/account-deletion/preview')
    .set('Origin', ORIGIN)
    .send({ token });
const confirm = (token: string) =>
  request(server)
    .post('/api/v1/auth/account-deletion/confirm')
    .set('Origin', ORIGIN)
    .send({ token });

/** An owner with a password and two collections (one archived), and the mailed link. */
async function owner() {
  const email = newEmail();
  const account = await signInAs(app, prisma, email, true, true, 'trial');
  await givePassword(app, prisma, account.userId, PASSWORD);
  const tokens = app.get(GuestLinkTokens);
  const active = await seedCollection(prisma, tokens, { ownerId: account.userId });
  const archived = await seedCollection(prisma, tokens, { ownerId: account.userId });
  await prisma.collection.update({
    where: { id: archived.collectionId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
  const link = async (): Promise<string> => {
    const before = (await messagesAfter(email, 0)).length;
    expect((await ask(account.cookie).expect(202)).body).toEqual({ status: 'sent' });
    const messages = await waitForMessages(email, before + 1);
    return mailedToken(messages[0]?.ID ?? '');
  };
  return {
    ...account,
    email,
    link,
    collectionIds: [active.collectionId, archived.collectionId],
  };
}

/** A live LiqPay subscription for the owner, through the real checkout and callback. */
async function subscribe(cookie: string) {
  const res = await request(server)
    .post('/api/v1/billing/checkouts')
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .send({
      kind: 'SUBSCRIPTION',
      priceId: prices['sub-pro'].MONTH,
      autoRenewConsent: true,
      termsVersion: TERMS,
    })
    .expect(201);
  const id = checkoutResponseSchema.parse(res.body).paymentId ?? '';
  const start = await prisma.payment.findUniqueOrThrow({ where: { id } });
  await request(server)
    .post('/api/v1/billing/liqpay/callback')
    .type('form')
    .send(signedCallback(subscribeFields(start, 'subscribed', { end_date: Date.now() - 60_000 })))
    .expect(200);
  return { start, subscriptionId: start.subscriptionId ?? '' };
}

describe('account deletion', () => {
  test('the link shows what goes; confirming deletes everything but the payment records', async () => {
    const a = await owner();
    const token = await a.link();

    expect(
      accountDeletionPreviewResponseSchema.parse((await preview(token).expect(200)).body),
    ).toEqual({ email: a.email, collections: 2, subscription: false });

    const res = await confirm(token).expect(200);
    expect(res.body).toEqual({ status: 'deleted' });
    expect(String(res.headers['set-cookie'])).toMatch(/st_session=;/);
    await me(a.cookie).expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user).toMatchObject({
      email: deletedAddress(a.userId),
      emailVerifiedAt: null,
      displayName: null,
      status: 'DELETED',
    });
    expect(user.deletedAt).not.toBeNull();
    const where = { where: { userId: a.userId } };
    expect(await prisma.authSession.count(where)).toBe(0);
    expect(await prisma.authAccount.count(where)).toBe(0);
    expect(await prisma.passwordCredential.count(where)).toBe(0);
    expect(await prisma.authEmailToken.count(where)).toBe(0);
    expect(await prisma.legalAcceptance.count(where)).toBe(0);

    const collections = await prisma.collection.findMany({ where: { ownerId: a.userId } });
    expect(collections.map((c) => c.status)).toEqual(['DELETING', 'DELETING']);
    const purges = await queuedJobs(prisma, 'collection.purge');
    expect(purges.map((job) => (job.data as { collectionId: string }).collectionId).sort()).toEqual(
      [...a.collectionIds].sort(),
    );
    expect(
      await prisma.auditEvent.count({ where: { action: 'account.delete', targetId: a.userId } }),
    ).toBe(1);

    // The link works once; the old address signs in to nothing.
    expect((await confirm(token).expect(400)).body).toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
    await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: a.email, password: PASSWORD })
      .expect(401);
  });

  test('the address is free again: a new sign-up is a new account', async () => {
    const a = await owner();
    await confirm(await a.link()).expect(200);
    // Registration looks the address up first (password-auth.e2e covers the route itself).
    expect(await prisma.user.findUnique({ where: { email: a.email } })).toBeNull();
    const again = await prisma.user.create({ data: { email: a.email } });
    expect(again.id).not.toBe(a.userId);
  });

  test('a subscription is stopped at LiqPay first; when LiqPay does not confirm, nothing changes', async () => {
    const a = await owner();
    const { start, subscriptionId } = await subscribe(a.cookie);
    const token = await a.link();
    expect((await preview(token).expect(200)).body).toMatchObject({ subscription: true });

    stub.answers.set(`unsubscribe:${start.id}`, 'down');
    expect((await confirm(token).expect(503)).body).toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
    await me(a.cookie).expect(200);
    expect(await prisma.collection.count({ where: { status: 'DELETING' } })).toBe(0);
    await preview(token).expect(200);

    stub.answers.set(`unsubscribe:${start.id}`, { action: 'unsubscribe', status: 'unsubscribed' });
    await confirm(token).expect(200);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(sub.status).toBe('EXPIRED');
    expect(sub.endedAt).not.toBeNull();
    expect(sub.providerUnsubscribedAt).not.toBeNull();
    // The accounting record stays, on the anonymised account.
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: start.id } })).toMatchObject({
      userId: a.userId,
      status: 'SUCCEEDED',
    });
  });

  test('a checkout still payable holds the deletion back', async () => {
    const a = await owner();
    await request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', a.cookie)
      .send({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].MONTH,
        autoRenewConsent: true,
        termsVersion: TERMS,
      })
      .expect(201);
    const token = await a.link();
    expect((await confirm(token).expect(409)).body).toMatchObject({ code: 'PAYMENT_PENDING' });
    await me(a.cookie).expect(200);
  });

  test('an expired or unknown link is refused; the operator account cannot ask', async () => {
    const a = await owner();
    const token = await a.link();
    await prisma.authEmailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await preview(token).expect(400);
    await confirm(token).expect(400);
    await me(a.cookie).expect(200);
    await preview('A'.repeat(43)).expect(400);

    const operator = await signInAs(app, prisma, OPERATOR);
    expect((await ask(operator.cookie).expect(403)).body).toMatchObject({ code: 'FORBIDDEN' });
    await ask('st_session=nope').expect(401);
  });

  test('a newer link replaces the older one', async () => {
    const a = await owner();
    const first = await a.link();
    const second = await a.link();
    await preview(first).expect(400);
    await preview(second).expect(200);
  });
});
