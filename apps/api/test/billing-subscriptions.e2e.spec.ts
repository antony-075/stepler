import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { checkoutResponseSchema, usageResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { addInterval } from '../src/billing/domain/periods.js';
import { decodeData } from '../src/billing/liqpay/liqpay-signature.js';
import { createApp } from '../src/create-app.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  grantTestPlan,
  liqpayEnv,
  priceSubscriptions,
  regularFields,
  signedCallback,
  type SubscriptionPrices,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Subscriptions through LiqPay's recurring payments (ADR 0018, plan Task 15, Review Focus 1, 4):
// the `subscribe` checkout, its first payment and the `regular` renewal callbacks. Replays,
// duplicates and reordering never charge or grant twice.

const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;
let prices: SubscriptionPrices;

beforeAll(async () => {
  app = await createApp(testEnv(liqpayEnv()));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  prices = await priceSubscriptions(prisma);
});

const post = (fields: Record<string, unknown>) =>
  request(server)
    .post('/api/v1/billing/liqpay/callback')
    .type('form')
    .send(signedCallback(fields))
    .expect(200);

async function owner(email = 'olena@example.com') {
  const account = await signInAs(app, prisma, email, true, true, 'trial');
  const checkout = (body: object) =>
    request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', account.cookie)
      .send(body);
  const subscribe = async (priceId = prices['sub-pro'].MONTH): Promise<Payment> => {
    const res = await checkout({
      kind: 'SUBSCRIPTION',
      priceId,
      autoRenewConsent: true,
      termsVersion: 'v2',
    }).expect(201);
    const { paymentId } = checkoutResponseSchema.parse(res.body);
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId ?? '' } });
  };
  const usage = async () =>
    usageResponseSchema.parse(
      (await request(server).get('/api/v1/me/usage').set('Cookie', account.cookie).expect(200))
        .body,
    );
  return { ...account, checkout, subscribe, usage };
}

const subOf = (payment: Payment) =>
  prisma.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId ?? '' } });

/** Subscribes and pays the first charge at `paidAt`; returns the start payment. */
async function activeSubscription(
  account: Awaited<ReturnType<typeof owner>>,
  paidAt = Date.now() - 60_000,
) {
  const start = await account.subscribe();
  await post(subscribeFields(start, 'subscribed', { end_date: paidAt }));
  return start;
}

describe('checkout', () => {
  test('consent and terms are required; amounts are never accepted', async () => {
    const a = await owner();
    await a
      .checkout({ kind: 'SUBSCRIPTION', priceId: prices['sub-pro'].MONTH, termsVersion: 'v2' })
      .expect(400);
    await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].MONTH,
        autoRenewConsent: false,
        termsVersion: 'v2',
      })
      .expect(400);
    await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].MONTH,
        autoRenewConsent: true,
        termsVersion: 'v2',
        amountMinor: 1,
      })
      .expect(400);
  });

  test('a recurring LiqPay form, a pending plan with the consent, one per account', async () => {
    const a = await owner();
    const res = await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].YEAR,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(201);
    const body = checkoutResponseSchema.parse(res.body);
    const data = decodeData(body.form?.fields.data ?? '');
    expect(data).toMatchObject({
      action: 'subscribe',
      amount: '5000.00',
      currency: 'UAH',
      order_id: body.paymentId,
      subscribe: 1,
      subscribe_periodicity: 'year',
    });
    expect(JSON.stringify(body)).not.toContain(liqpayEnv().LIQPAY_PRIVATE_KEY);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: body.paymentId ?? '' } });
    expect(payment).toMatchObject({
      kind: 'SUBSCRIPTION',
      status: 'PENDING',
      amountMinor: 500_000,
    });
    expect(await subOf(payment)).toMatchObject({
      status: 'PENDING',
      source: 'LIQPAY',
      interval: 'YEAR',
      providerOrderId: payment.id,
      consentTermsVersion: 'v2',
      activeCollections: 5,
    });
    expect((await subOf(payment)).autoRenewConsentAt).not.toBeNull();

    // The same price again: the same payment, freshly signed. Another price: 409.
    const again = checkoutResponseSchema.parse(
      (
        await a
          .checkout({
            kind: 'SUBSCRIPTION',
            priceId: prices['sub-pro'].YEAR,
            autoRenewConsent: true,
            termsVersion: 'v2',
          })
          .expect(201)
      ).body,
    );
    expect(again.paymentId).toBe(body.paymentId);
    const other = await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-business'].MONTH,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(409);
    expect(other.body).toMatchObject({ code: 'PAYMENT_PENDING' });
  });

  test('a pack price, an inactive price or a live paid plan are refused', async () => {
    const a = await owner();
    await prisma.billingPrice.update({
      where: { id: prices['sub-business'].MONTH },
      data: { active: false },
    });
    const inactive = await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-business'].MONTH,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(409);
    expect(inactive.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    await activeSubscription(a);
    const exists = await a
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].YEAR,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(409);
    expect(exists.body).toMatchObject({ code: 'SUBSCRIPTION_EXISTS' });
  });
});

describe('the first payment', () => {
  test('`subscribed` activates the plan for a month from the charge; 5 collections', async () => {
    const a = await owner();
    const paidAt = Date.UTC(2027, 0, 31, 10);
    const start = await a.subscribe();
    await post(subscribeFields(start, 'subscribed', { end_date: paidAt }));

    const sub = await subOf(start);
    expect(sub).toMatchObject({
      status: 'ACTIVE',
      currentPeriodStart: new Date(paidAt),
      currentPeriodEnd: new Date(Date.UTC(2027, 1, 28, 10)),
    });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: start.id } })).toMatchObject({
      status: 'SUCCEEDED',
      paidAt: new Date(paidAt),
      periodEnd: new Date(Date.UTC(2027, 1, 28, 10)),
    });
    const usage = await a.usage();
    expect(usage.access).toMatchObject({ state: 'ACTIVE', reason: 'SUBSCRIPTION' });
    expect(usage.activeCollections.limit).toBe(5);
  });

  test('a replayed or re-encoded start keeps one period; `success` works as well', async () => {
    const a = await owner();
    const start = await a.subscribe();
    const paidAt = Date.now() - 60_000;
    const fields = subscribeFields(start, 'subscribed', { end_date: paidAt });
    await post(fields);
    await post(fields);
    await post({ ...fields, end_date: paidAt + 5_000 });
    await post(subscribeFields(start, 'success'));
    const sub = await subOf(start);
    expect(sub.currentPeriodStart).toEqual(new Date(paidAt));
    expect(await prisma.payment.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  test('a complimentary grant is replaced by the paid plan', async () => {
    const a = await owner();
    await grantTestPlan(prisma, a.userId);
    const start = await activeSubscription(a);
    const subs = await prisma.subscription.findMany({ where: { userId: a.userId } });
    expect(subs.find((s) => s.source === 'COMPLIMENTARY')?.status).toBe('EXPIRED');
    expect((await subOf(start)).status).toBe('ACTIVE');
    expect((await a.usage()).access.reason).toBe('SUBSCRIPTION');
  });

  test('another amount is a mismatch: nothing starts', async () => {
    const a = await owner();
    const start = await a.subscribe();
    await post(subscribeFields({ ...start, amountMinor: 100 }));
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: start.id } })).toMatchObject({
      status: 'PENDING',
      mismatch: true,
    });
    expect((await subOf(start)).status).toBe('PENDING');
  });
});

describe('renewals', () => {
  test('a `regular` success advances one interval once, however often it is delivered', async () => {
    const a = await owner();
    const start = await activeSubscription(a);
    const before = await subOf(start);
    const end = before.currentPeriodEnd ?? new Date();
    const charge = regularFields(start.id, 'success', 50_000, { end_date: end.getTime() + 60_000 });
    await post(charge);
    await post(charge);
    await post({ ...charge, end_date: end.getTime() + 120_000 });
    await Promise.all(Array.from({ length: 5 }, () => post({ ...charge, liqpay_order_id: 'x' })));

    const after = await subOf(start);
    expect(after).toMatchObject({ status: 'ACTIVE', currentPeriodStart: end });
    expect(after.currentPeriodEnd).toEqual(addInterval(end, 'MONTH'));
    const renewals = await prisma.payment.findMany({
      where: { subscriptionId: after.id, kind: 'SUBSCRIPTION_RENEWAL' },
    });
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({
      status: 'SUCCEEDED',
      amountMinor: 50_000,
      providerPaymentId: String(charge.payment_id),
      periodStart: end,
      needsReview: false,
    });
  });

  test('a failed renewal starts grace with one mail; a later success ends it', async () => {
    const a = await owner();
    const start = await activeSubscription(a);
    const sub = await subOf(start);
    const end = sub.currentPeriodEnd ?? new Date();
    // The charge at the period end fails; LiqPay retries (two more failures).
    await post(regularFields(start.id, 'failure', 50_000, { end_date: end.getTime() + 1_000 }));
    await post(regularFields(start.id, 'failure', 50_000, { end_date: end.getTime() + 2_000 }));
    const pastDue = await subOf(start);
    expect(pastDue).toMatchObject({
      status: 'PAST_DUE',
      graceEndsAt: new Date(end.getTime() + 4 * DAY_MS),
      currentPeriodEnd: end,
    });
    expect(await queuedJobs(prisma, 'mail.billing-renewal-failed')).toHaveLength(1);
    // Grace is not read-only.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodEnd: new Date(Date.now() - DAY_MS),
        currentPeriodStart: new Date(Date.now() - 31 * DAY_MS),
        graceEndsAt: new Date(Date.now() + 3 * DAY_MS),
      },
    });
    expect((await a.usage()).access).toMatchObject({
      state: 'GRACE',
      reason: 'SUBSCRIPTION_PAST_DUE',
    });

    const paidAt = Date.now() - 1_000;
    const periodEnd = (await subOf(start)).currentPeriodEnd ?? new Date();
    const retry = regularFields(start.id, 'success', 50_000, { end_date: paidAt });
    await post(retry);
    const renewed = await subOf(start);
    expect(renewed).toMatchObject({
      status: 'ACTIVE',
      graceEndsAt: null,
      currentPeriodStart: periodEnd,
    });
    expect((await a.usage()).access.state).toBe('ACTIVE');
    // An older failure delivered late does not put the plan back into grace.
    await post(regularFields(start.id, 'failure', 50_000, { end_date: paidAt - 60_000 }));
    expect((await subOf(start)).status).toBe('ACTIVE');
    expect(
      await prisma.payment.count({ where: { subscriptionId: sub.id, status: 'FAILED' } }),
    ).toBe(3);
  });

  test('a renewal after the plan expired starts a new period at the charge', async () => {
    const a = await owner();
    const start = await activeSubscription(a);
    const sub = await subOf(start);
    const ended = new Date(Date.now() - 10 * DAY_MS);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'EXPIRED',
        currentPeriodStart: new Date(ended.getTime() - 30 * DAY_MS),
        currentPeriodEnd: ended,
        endedAt: ended,
      },
    });
    const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
      ownerId: a.userId,
    });
    await prisma.collection.update({
      where: { id: collectionId },
      data: { deleteAfter: new Date(Date.now() + 300 * DAY_MS) },
    });
    const paidAt = Date.now() - 5_000;
    await post(regularFields(start.id, 'success', 50_000, { end_date: paidAt }));
    expect(await subOf(start)).toMatchObject({
      status: 'ACTIVE',
      currentPeriodStart: new Date(paidAt),
      endedAt: null,
    });
    const after = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } });
    expect(after.deleteAfter).toBeNull();
  });

  test('another currency is a mismatch: kept for the operator, no period', async () => {
    const a = await owner();
    const start = await activeSubscription(a);
    const before = await subOf(start);
    await post(regularFields(start.id, 'success', 50_000, { currency: 'USD' }));
    const after = await subOf(start);
    expect(after.currentPeriodEnd).toEqual(before.currentPeriodEnd);
    const renewal = await prisma.payment.findFirstOrThrow({
      where: { subscriptionId: before.id, kind: 'SUBSCRIPTION_RENEWAL' },
    });
    expect(renewal).toMatchObject({ mismatch: true, needsReview: true });
  });

  test('a renewal of an order that is not ours is stored and answered 200', async () => {
    await owner();
    await post(regularFields('01900000-0000-7000-8000-000000000000', 'success', 50_000));
    const event = await prisma.paymentEvent.findFirstOrThrow();
    expect(event.outcome).toBe('unknown_order');
  });

  test('LiqPay `unsubscribed` (the payer at the bank) cancels with access to the period end', async () => {
    const a = await owner();
    const start = await activeSubscription(a);
    await post(subscribeFields(start, 'unsubscribed', { action: 'unsubscribe' }));
    const sub = await subOf(start);
    expect(sub).toMatchObject({ status: 'CANCELED', cancelAtPeriodEnd: true });
    expect(sub.providerUnsubscribedAt).not.toBeNull();
    expect((await a.usage()).access).toMatchObject({ state: 'ACTIVE', reason: 'SUBSCRIPTION' });
  });
});
