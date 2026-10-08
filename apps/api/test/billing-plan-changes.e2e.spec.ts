import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  billingSummarySchema,
  checkoutResponseSchema,
  planChangePreviewSchema,
  subscriptionDtoSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { addInterval } from '../src/billing/domain/periods.js';
import { prorate } from '../src/billing/domain/proration.js';
import { createApp } from '../src/create-app.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  liqpayEnv,
  payFields,
  priceSubscriptions,
  regularFields,
  signedCallback,
  type SubscriptionCode,
  type SubscriptionPrices,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { signInAs } from './support/sessions.js';

// Cancel, resume, upgrade with proration, scheduled downgrade and the monthly ↔ yearly switch
// (ADR 0018 [P10], [P11], [Q6], plan Task 17, Review Focus 3). The real `LiqPayProvider`
// against a local stand-in of LiqPay's endpoint (rule 18).

const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

let app: INestApplication;
let server: Server;
let prices: SubscriptionPrices;

beforeAll(async () => {
  await stub.start();
  app = await createApp(testEnv(liqpayEnv(stub.base)));
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

const post = (fields: Record<string, unknown>) =>
  request(server)
    .post('/api/v1/billing/liqpay/callback')
    .type('form')
    .send(signedCallback(fields))
    .expect(200);

/**
 * An account on a paid monthly plan whose period runs `[start, start + 1 month)`, `elapsed`
 * of it gone. LiqPay's `subscribe_update` and `unsubscribe` answer like the sandbox (S1b).
 */
async function subscriber(
  code: SubscriptionCode = 'sub-pro',
  elapsedMs = 15 * DAY_MS,
  email = 'olena@example.com',
) {
  const account = await signInAs(app, prisma, email, true, true, 'trial');
  const call = (method: 'get' | 'post' | 'delete', path: string) =>
    request(server)
      [method](`/api/v1/billing${path}`)
      .set('Origin', ORIGIN)
      .set('Cookie', account.cookie);
  const res = await call('post', '/checkouts')
    .send({
      kind: 'SUBSCRIPTION',
      priceId: prices[code].MONTH,
      autoRenewConsent: true,
      termsVersion: 'v2',
    })
    .expect(201);
  const start = await prisma.payment.findUniqueOrThrow({
    where: { id: checkoutResponseSchema.parse(res.body).paymentId ?? '' },
  });
  await post(subscribeFields(start));
  const periodStart = new Date(Date.now() - elapsedMs);
  const periodEnd = addInterval(periodStart, 'MONTH');
  const subscriptionId = start.subscriptionId ?? '';
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
  });
  stub.answers.set(`unsubscribe:${start.id}`, { action: 'unsubscribe', status: 'unsubscribed' });
  const updates = (amountMinor: number) =>
    stub.answers.set(`subscribe_update:${start.id}`, {
      ...subscribeFields(start),
      amount: amountMinor / 100,
    });
  const change = (priceId: string) =>
    call('post', '/checkouts').send({ kind: 'SUBSCRIPTION_CHANGE', priceId });
  const usage = async () =>
    usageResponseSchema.parse(
      (await request(server).get('/api/v1/me/usage').set('Cookie', account.cookie).expect(200))
        .body,
    );
  return {
    ...account,
    call,
    start,
    subscriptionId,
    periodStart,
    periodEnd,
    updates,
    change,
    usage,
  };
}

const subOf = (id: string) => prisma.subscription.findUniqueOrThrow({ where: { id } });
const calls = (action: string) => stub.calls.filter((c) => c.action === action);

async function collections(ownerId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await seedCollection(prisma, app.get(GuestLinkTokens), { ownerId, title: `Подія ${i + 1}` });
  }
}

describe('authorization', () => {
  test('signed out → 401; a plan of another account is never reached', async () => {
    await request(server).get('/api/v1/billing/summary').expect(401);
    await request(server)
      .post('/api/v1/billing/subscription/cancel')
      .set('Origin', ORIGIN)
      .expect(401);
    await request(server)
      .delete('/api/v1/billing/subscription/pending-change')
      .set('Origin', ORIGIN)
      .expect(401);
    await request(server)
      .get(`/api/v1/billing/subscription/change-preview?priceId=${prices['sub-pro'].MONTH}`)
      .expect(401);
    const owner = await subscriber();
    const other = await signInAs(app, prisma, 'taras@example.com', true, true, 'trial');
    await request(server)
      .post('/api/v1/billing/subscription/cancel')
      .set('Origin', ORIGIN)
      .set('Cookie', other.cookie)
      .expect(404);
    expect(calls('unsubscribe')).toHaveLength(0);
    expect((await subOf(owner.subscriptionId)).status).toBe('ACTIVE');
    const summary = billingSummarySchema.parse(
      (await request(server).get('/api/v1/billing/summary').set('Cookie', other.cookie).expect(200))
        .body,
    );
    expect(summary.subscription).toBeNull();
  });
});

describe('cancel', () => {
  test('LiqPay stops charging first; access stays to the period end; repeating is a no-op', async () => {
    const s = await subscriber();
    const dto = subscriptionDtoSchema.parse(
      (await s.call('post', '/subscription/cancel').expect(200)).body,
    );
    expect(dto).toMatchObject({ status: 'CANCELED', cancelAtPeriodEnd: true });
    expect(calls('unsubscribe')).toEqual([{ action: 'unsubscribe', orderId: s.start.id }]);
    expect((await s.usage()).access).toMatchObject({
      state: 'ACTIVE',
      reason: 'SUBSCRIPTION',
      endsAt: s.periodEnd.toISOString(),
    });
    await s.call('post', '/subscription/cancel').expect(200);
    expect(calls('unsubscribe')).toHaveLength(1);
  });

  test('LiqPay unreachable → 503 and nothing changes', async () => {
    const s = await subscriber();
    stub.answers.set(`unsubscribe:${s.start.id}`, 'down');
    stub.answers.set(`status:${s.start.id}`, 'down');
    const res = await s.call('post', '/subscription/cancel').expect(503);
    expect(res.body).toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    expect(await subOf(s.subscriptionId)).toMatchObject({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    });
  });

  test('resume: a new checkout at the same price; the new period starts at the old end', async () => {
    const s = await subscriber();
    await s.call('post', '/subscription/cancel').expect(200);
    await s.call('post', '/subscription/resume').send({ termsVersion: 'v2' }).expect(400);
    const res = await s
      .call('post', '/subscription/resume')
      .send({ autoRenewConsent: true, termsVersion: 'v2' })
      .expect(201);
    const body = checkoutResponseSchema.parse(res.body);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: body.paymentId ?? '' } });
    expect(payment).toMatchObject({ kind: 'SUBSCRIPTION', amountMinor: 50_000 });
    await post(subscribeFields(payment));
    const resumed = await subOf(payment.subscriptionId ?? '');
    expect(resumed).toMatchObject({ status: 'ACTIVE', currentPeriodStart: s.periodEnd });
    expect(resumed.currentPeriodEnd).toEqual(addInterval(s.periodEnd, 'MONTH'));
    expect((await subOf(s.subscriptionId)).status).toBe('EXPIRED');
  });

  test('resume of a plan that is not cancelled → 409', async () => {
    const s = await subscriber();
    const res = await s
      .call('post', '/subscription/resume')
      .send({ autoRenewConsent: true, termsVersion: 'v2' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'SUBSCRIPTION_EXISTS' });
  });
});

describe('upgrade', () => {
  test('half-way: the prorated charge, then Business at once and its price at LiqPay', async () => {
    const s = await subscriber('sub-pro', 15 * DAY_MS);
    const preview = planChangePreviewSchema.parse(
      (
        await s
          .call('get', `/subscription/change-preview?priceId=${prices['sub-business'].MONTH}`)
          .expect(200)
      ).body,
    );
    expect(preview).toMatchObject({
      kind: 'UPGRADE',
      effective: 'NOW',
      waived: false,
      blocked: null,
    });

    const res = await s.change(prices['sub-business'].MONTH).expect(201);
    const body = checkoutResponseSchema.parse(res.body);
    expect(body.status).toBe('PENDING');
    const payment: Payment = await prisma.payment.findUniqueOrThrow({
      where: { id: body.paymentId ?? '' },
    });
    const expected = prorate({
      oldPriceMinor: 50_000,
      newPriceMinor: 120_000,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      now: payment.createdAt,
      minChargeMinor: 100,
    });
    expect(Math.abs(payment.amountMinor - expected.chargeMinor)).toBeLessThanOrEqual(1);
    expect(payment.amountMinor).toBeGreaterThan(0);
    expect(payment.amountMinor).toBeLessThanOrEqual(70_000);
    expect(Math.abs(preview.chargeMinor - payment.amountMinor)).toBeLessThanOrEqual(1);
    expect(payment).toMatchObject({ kind: 'SUBSCRIPTION_CHANGE', periodEnd: s.periodEnd });

    s.updates(120_000);
    await post(payFields(payment, 'success'));
    expect((await s.usage()).activeCollections.limit).toBe(20);
    expect(await subOf(s.subscriptionId)).toMatchObject({
      amountMinor: 120_000,
      priceId: prices['sub-business'].MONTH,
      pendingProviderAmountMinor: null,
      currentPeriodEnd: s.periodEnd,
    });
    expect(calls('subscribe_update').at(-1)).toMatchObject({
      orderId: s.start.id,
      amount: '1200.00',
    });
  });

  test('30 seconds before the period end the charge is waived and applied now', async () => {
    const s = await subscriber('sub-pro', 0);
    const end = new Date(Date.now() + 30_000);
    await prisma.subscription.update({
      where: { id: s.subscriptionId },
      data: { currentPeriodStart: addInterval(end, 'MONTH', -1), currentPeriodEnd: end },
    });
    s.updates(120_000);
    const body = checkoutResponseSchema.parse(
      (await s.change(prices['sub-business'].MONTH).expect(201)).body,
    );
    expect(body).toEqual({ paymentId: null, status: 'SUCCEEDED', form: null });
    expect(await prisma.payment.count({ where: { kind: 'SUBSCRIPTION_CHANGE' } })).toBe(0);
    expect(await subOf(s.subscriptionId)).toMatchObject({
      activeCollections: 20,
      pendingProviderAmountMinor: null,
    });
  });

  test('in grace the renewal is paid first: 409 PAYMENT_PENDING', async () => {
    const s = await subscriber();
    await prisma.subscription.update({
      where: { id: s.subscriptionId },
      data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() + DAY_MS) },
    });
    const res = await s.change(prices['sub-business'].MONTH).expect(409);
    expect(res.body).toMatchObject({ code: 'PAYMENT_PENDING' });
  });
});

describe('downgrade', () => {
  test('7 active collections do not fit Pro: 409 with what to reduce', async () => {
    const s = await subscriber('sub-business');
    await collections(s.userId, 7);
    const res = await s.change(prices['sub-pro'].MONTH).expect(409);
    expect(res.body).toMatchObject({
      code: 'PLAN_DOWNGRADE_BLOCKED',
      excess: [{ limit: 'activeCollections', used: 7, allowed: 5, collectionId: null }],
    });
    const preview = planChangePreviewSchema.parse(
      (
        await s
          .call('get', `/subscription/change-preview?priceId=${prices['sub-pro'].MONTH}`)
          .expect(200)
      ).body,
    );
    expect(preview.blocked).toEqual([
      { limit: 'activeCollections', used: 7, allowed: 5, collectionId: null },
    ]);
    expect(calls('subscribe_update')).toHaveLength(0);
  });

  test('a downgrade that fits is scheduled and applies with the next charge at its price', async () => {
    const s = await subscriber('sub-business');
    await collections(s.userId, 2);
    s.updates(50_000);
    const body = checkoutResponseSchema.parse(
      (await s.change(prices['sub-pro'].MONTH).expect(201)).body,
    );
    expect(body).toEqual({ paymentId: null, status: 'SCHEDULED', form: null });
    expect(calls('subscribe_update').at(-1)).toMatchObject({ amount: '500.00' });
    const summary = billingSummarySchema.parse((await s.call('get', '/summary').expect(200)).body);
    expect(summary.subscription?.pendingChange).toMatchObject({
      offerTitle: 'Pro',
      price: { amountMinor: 50_000, currency: 'UAH' },
      effectiveAt: s.periodEnd.toISOString(),
    });
    // Still Business until the period ends.
    expect((await s.usage()).activeCollections.limit).toBe(20);

    await post(
      regularFields(s.start.id, 'success', 50_000, { end_date: s.periodEnd.getTime() + 60_000 }),
    );
    expect(await subOf(s.subscriptionId)).toMatchObject({
      offerId: prices['sub-pro'].offerId,
      priceId: prices['sub-pro'].MONTH,
      amountMinor: 50_000,
      activeCollections: 5,
      pendingPriceId: null,
      currentPeriodStart: s.periodEnd,
    });
  });

  test('withdrawing a scheduled downgrade gives LiqPay the current price back', async () => {
    const s = await subscriber('sub-business');
    s.updates(50_000);
    await s.change(prices['sub-pro'].MONTH).expect(201);
    s.updates(120_000);
    const dto = subscriptionDtoSchema.parse(
      (await s.call('delete', '/subscription/pending-change').expect(200)).body,
    );
    expect(dto.pendingChange).toBeNull();
    expect(calls('subscribe_update').at(-1)).toMatchObject({ amount: '1200.00' });
    await s.call('delete', '/subscription/pending-change').expect(404);
  });

  test('LiqPay unreachable when scheduling → 503, nothing scheduled', async () => {
    const s = await subscriber('sub-business');
    stub.answers.set(`subscribe_update:${s.start.id}`, 'down');
    await s.change(prices['sub-pro'].MONTH).expect(503);
    expect((await subOf(s.subscriptionId)).pendingPriceId).toBeNull();
  });
});

describe('monthly ↔ yearly', () => {
  test('a yearly checkout now; its first year starts when the month ends; the month ends', async () => {
    const s = await subscriber('sub-pro');
    const res = await s.change(prices['sub-pro'].YEAR).expect(201);
    const body = checkoutResponseSchema.parse(res.body);
    expect(body.status).toBe('PENDING');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: body.paymentId ?? '' } });
    expect(payment).toMatchObject({ kind: 'SUBSCRIPTION', amountMinor: 500_000 });
    expect((await subOf(s.subscriptionId)).pendingPriceId).toBe(prices['sub-pro'].YEAR);

    await post(subscribeFields(payment));
    const yearly = await subOf(payment.subscriptionId ?? '');
    expect(yearly).toMatchObject({
      status: 'ACTIVE',
      interval: 'YEAR',
      currentPeriodStart: s.periodEnd,
    });
    expect(yearly.currentPeriodEnd).toEqual(addInterval(s.periodEnd, 'YEAR'));
    expect(await subOf(s.subscriptionId)).toMatchObject({
      status: 'EXPIRED',
      providerUnsubscribedAt: null,
    });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
      needsReview: false,
    });
  });
});
