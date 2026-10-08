import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { checkoutResponseSchema, paymentDtoSchema, usageResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { addInterval } from '../src/billing/domain/periods.js';
import { EntitlementResolver } from '../src/billing/entitlement-resolver.js';
import { PaymentEvents } from '../src/billing/payment-events.service.js';
import { ReconciliationService } from '../src/billing/reconciliation.service.js';
import { SubscriptionClocks } from '../src/billing/subscription-clocks.js';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { BillingReconcileHandler } from '../src/worker/handlers/billing-reconcile.handler.js';
import { listenOnLoopback } from './support/app.js';
import {
  liqpayEnv,
  priceSubscriptions,
  regularFields,
  setTrialEnd,
  signedCallback,
  type SubscriptionPrices,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { signInAs } from './support/sessions.js';

// The subscription clocks of the reconcile job (ADR 0018 [P12], plan Task 16, Review Focus 5):
// a missed renewal callback, grace, expiry, a provider outage and a paused worker. The real
// `LiqPayProvider` against a local stand-in of LiqPay's endpoint (rule 18).

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

let app: INestApplication;
let server: Server;
let handler: BillingReconcileHandler;
let prices: SubscriptionPrices;

beforeAll(async () => {
  await stub.start();
  app = await createApp(testEnv(liqpayEnv(stub.base)));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
  handler = new BillingReconcileHandler(
    app.get(PrismaService),
    app.get(ReconciliationService),
    app.get(PaymentEvents),
    app.get(SubscriptionClocks),
  );
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

/** An account with a paid «Pro» monthly plan whose period ended `endedAgoMs` ago. */
async function lapsed(endedAgoMs: number) {
  const account = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const res = await request(server)
    .post('/api/v1/billing/checkouts')
    .set('Origin', ORIGIN)
    .set('Cookie', account.cookie)
    .send({
      kind: 'SUBSCRIPTION',
      priceId: prices['sub-pro'].MONTH,
      autoRenewConsent: true,
      termsVersion: 'v2',
    })
    .expect(201);
  const start = await prisma.payment.findUniqueOrThrow({
    where: { id: checkoutResponseSchema.parse(res.body).paymentId },
  });
  await post(subscribeFields(start));
  // The trial is long over: when the plan ends, nothing else holds the account's access.
  await setTrialEnd(prisma, account.userId, new Date(Date.now() - 60 * DAY_MS));
  const end = new Date(Date.now() - endedAgoMs);
  const subscriptionId = start.subscriptionId ?? '';
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { currentPeriodStart: addInterval(end, 'MONTH', -1), currentPeriodEnd: end },
  });
  // LiqPay's `status` of the order: the `subscribe` transaction, as spike S1b saw it.
  stub.answers.set(start.id, { ...subscribeFields(start), status: 'subscribed' });
  const usage = async () =>
    usageResponseSchema.parse(
      (await request(server).get('/api/v1/me/usage').set('Cookie', account.cookie).expect(200))
        .body,
    );
  return { ...account, start, end, subscriptionId, usage };
}

const subOf = (id: string) => prisma.subscription.findUniqueOrThrow({ where: { id } });
const calls = (action: string) => stub.calls.filter((call) => call.action === action);

describe('a renewal without its callback', () => {
  test('`status` showing a regular charge renews the plan', async () => {
    const s = await lapsed(2 * HOUR_MS);
    stub.answers.set(
      s.start.id,
      regularFields(s.start.id, 'success', 50_000, { end_date: s.end.getTime() + 60_000 }),
    );
    await handler.run(new Date());
    const sub = await subOf(s.subscriptionId);
    expect(sub).toMatchObject({ status: 'ACTIVE', currentPeriodStart: s.end });
    expect(sub.currentPeriodEnd).toEqual(addInterval(s.end, 'MONTH'));
    expect(
      await prisma.payment.count({
        where: { subscriptionId: sub.id, kind: 'SUBSCRIPTION_RENEWAL' },
      }),
    ).toBe(1);
  });

  test('nothing at LiqPay: grace, then expiry, read-only, unsubscribed once', async () => {
    const s = await lapsed(2 * HOUR_MS);
    expect((await s.usage()).access.state).toBe('ACTIVE');
    await handler.run(new Date());
    const grace = await subOf(s.subscriptionId);
    expect(grace).toMatchObject({
      status: 'PAST_DUE',
      graceEndsAt: new Date(s.end.getTime() + 4 * DAY_MS),
    });
    expect((await s.usage()).access.state).toBe('GRACE');
    expect(await queuedJobs(prisma, 'mail.billing-renewal-failed')).toHaveLength(1);

    // Hourly checks during grace change nothing; a second run sends no second mail.
    await handler.run(new Date(Date.now() + 2 * HOUR_MS));
    expect((await subOf(s.subscriptionId)).status).toBe('PAST_DUE');
    expect(await queuedJobs(prisma, 'mail.billing-renewal-failed')).toHaveLength(1);

    stub.answers.set(`unsubscribe:${s.start.id}`, {
      action: 'unsubscribe',
      status: 'unsubscribed',
    });
    const afterGrace = new Date(s.end.getTime() + 4 * DAY_MS + HOUR_MS);
    await handler.run(afterGrace);
    const expired = await subOf(s.subscriptionId);
    expect(expired).toMatchObject({ status: 'EXPIRED', endedAt: s.end });
    expect(expired.providerUnsubscribedAt).not.toBeNull();
    expect(calls('unsubscribe')).toHaveLength(1);
    const access = await app.get(EntitlementResolver).forAccount(s.userId, undefined, afterGrace);
    expect(access).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: s.end,
    });

    await handler.run(new Date(afterGrace.getTime() + HOUR_MS));
    expect(calls('unsubscribe')).toHaveLength(1);
  });

  test('LiqPay unreachable at the end of grace: the plan stays in grace', async () => {
    const s = await lapsed(5 * DAY_MS);
    stub.answers.set(s.start.id, 'down');
    await handler.run(new Date());
    const sub = await subOf(s.subscriptionId);
    expect(sub).toMatchObject({ status: 'PAST_DUE', lastRefreshOk: false });
    expect((await s.usage()).access.state).toBe('READ_ONLY');
    // (Read-only by the clock alone: grace ended a day ago; the plan is not EXPIRED, so the
    // retention clock does not start until LiqPay answers.)
    stub.answers.set(s.start.id, { ...subscribeFields(s.start), status: 'subscribed' });
    stub.answers.set(`unsubscribe:${s.start.id}`, {
      action: 'unsubscribe',
      status: 'unsubscribed',
    });
    await handler.run(new Date(Date.now() + HOUR_MS + 1_000));
    expect((await subOf(s.subscriptionId)).status).toBe('EXPIRED');
  });

  test('a worker paused for days reaches the same end state in one run', async () => {
    const s = await lapsed(6 * DAY_MS);
    stub.answers.set(`unsubscribe:${s.start.id}`, {
      action: 'unsubscribe',
      status: 'unsubscribed',
    });
    await handler.run(new Date());
    expect(await subOf(s.subscriptionId)).toMatchObject({ status: 'EXPIRED', endedAt: s.end });
    expect(calls('unsubscribe')).toHaveLength(1);
  });
});

describe('cancelled and repriced plans', () => {
  test('a cancelled plan past its period expires without another unsubscribe', async () => {
    const s = await lapsed(HOUR_MS);
    await prisma.subscription.update({
      where: { id: s.subscriptionId },
      data: {
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        providerUnsubscribedAt: new Date(),
      },
    });
    await handler.run(new Date());
    expect(await subOf(s.subscriptionId)).toMatchObject({ status: 'EXPIRED', endedAt: s.end });
    expect(calls('unsubscribe')).toHaveLength(0);
  });

  test('a price LiqPay has not confirmed is sent again until it is', async () => {
    const s = await lapsed(-10 * DAY_MS);
    await prisma.subscription.update({
      where: { id: s.subscriptionId },
      data: { pendingProviderAmountMinor: 120_000 },
    });
    stub.answers.set(`subscribe_update:${s.start.id}`, 'down');
    await handler.run(new Date());
    expect((await subOf(s.subscriptionId)).pendingProviderAmountMinor).toBe(120_000);
    stub.answers.set(`subscribe_update:${s.start.id}`, {
      ...subscribeFields(s.start),
      status: 'subscribed',
      amount: 1200,
    });
    await handler.run(new Date());
    expect((await subOf(s.subscriptionId)).pendingProviderAmountMinor).toBeNull();
    expect(calls('subscribe_update').at(-1)?.amount).toBe('1200.00');
  });
});

describe('a lost `subscribe` callback', () => {
  test("the return page's poll activates the plan from LiqPay's `status`", async () => {
    const account = await signInAs(app, prisma, 'taras@example.com', true, true, 'trial');
    const res = await request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', account.cookie)
      .send({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-business'].YEAR,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(201);
    const { paymentId } = checkoutResponseSchema.parse(res.body);
    const payment: Payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    stub.answers.set(paymentId, subscribeFields(payment));
    const polled = paymentDtoSchema.parse(
      (
        await request(server)
          .get(`/api/v1/billing/payments/${paymentId}`)
          .set('Cookie', account.cookie)
          .expect(200)
      ).body,
    );
    expect(polled.status).toBe('SUCCEEDED');
    const sub = await prisma.subscription.findFirstOrThrow({ where: { userId: account.userId } });
    expect(sub).toMatchObject({ status: 'ACTIVE', interval: 'YEAR' });
  });
});
