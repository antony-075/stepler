import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  checkoutResponseSchema,
  operatorPaymentDetailSchema,
  operatorPaymentListSchema,
  operatorSubscriptionListSchema,
  operatorSubscriptionRefreshSchema,
  operatorSubscriptionSchema,
  refundDtoSchema,
  currentLegalVersion,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { RefundsService } from '../src/billing/refunds.service.js';
import { createApp } from '../src/create-app.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  liqpayEnv,
  payFields,
  priceCatalogue,
  type PricedCode,
  priceSubscriptions,
  signedCallback,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { signInAs } from './support/sessions.js';

/** The Terms the auto-renewal consent is given to: the current version (plan Task 22). */
const TERMS = currentLegalVersion('TERMS').version;

// Payments, subscriptions and manual refunds in the operator console (ADR 0018, plan Task 21,
// owner decision B11): money never leaves twice, a refund never ends what was bought by itself,
// LiqPay's `reversed` for our own refund is not a chargeback, non-operators see nothing.

const OPERATOR = 'op@stepler.test';
const MINUTE_MS = 60_000;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

let app: INestApplication;
let server: Server;
let catalogue: Record<PricedCode, { offerId: string; priceId: string }>;

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
  catalogue = await priceCatalogue(prisma);
});

const callback = (fields: Record<string, unknown>) =>
  request(server)
    .post('/api/v1/billing/liqpay/callback')
    .type('form')
    .send(signedCallback(fields))
    .expect(200);

/** An owner who paid «Подія» (1 200,00 ₴) for a collection, and the operator. */
async function scene() {
  const operator = await signInAs(app, prisma, OPERATOR);
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
    ownerId: owner.userId,
  });
  const res = await request(server)
    .post('/api/v1/billing/checkouts')
    .set('Origin', ORIGIN)
    .set('Cookie', owner.cookie)
    .send({ kind: 'PACK', priceId: catalogue['pack-event'].priceId, collectionId })
    .expect(201);
  const id = checkoutResponseSchema.parse(res.body).paymentId ?? '';
  const pending = await prisma.payment.findUniqueOrThrow({ where: { id } });
  await callback(payFields(pending, 'success'));
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });
  expect(payment).toMatchObject({ status: 'SUCCEEDED', amountMinor: 120_000 });
  const refund = (amountMinor: number, key: string = randomUUID(), cookie = operator.cookie) =>
    request(server)
      .post(`/api/v1/operator/billing/payments/${payment.id}/refunds`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ amountMinor, reason: 'Подвійна оплата' });
  const get = (path: string, cookie = operator.cookie) =>
    request(server).get(`/api/v1/operator/billing${path}`).set('Cookie', cookie);
  return { operator, owner, collectionId, payment, refund, get };
}

const reversed = (orderId: string) => ({ action: 'refund', status: 'reversed', order_id: orderId });
const reload = (id: string): Promise<Payment> =>
  prisma.payment.findUniqueOrThrow({ where: { id } });
const refundCalls = () => stub.calls.filter((call) => call.action === 'refund');

describe('refunds', () => {
  test('a partial refund: PARTIALLY_REFUNDED, the pack stays, a second over the rest is refused', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, reversed(s.payment.id));
    const first = refundDtoSchema.parse((await s.refund(30_000).expect(201)).body);
    expect(first).toMatchObject({ status: 'SUCCEEDED', amountMinor: 30_000, currency: 'UAH' });
    expect(refundCalls()).toEqual([{ action: 'refund', orderId: s.payment.id, amount: '300.00' }]);
    expect(await reload(s.payment.id)).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      refundedMinor: 30_000,
    });
    // [Q4]: a refund does not end the pack by itself.
    const pack = await prisma.collectionPack.findUniqueOrThrow({
      where: { collectionId: s.collectionId },
    });
    expect(pack.retentionEndsAt.getTime()).toBeGreaterThan(Date.now());

    await s
      .refund(100_000)
      .expect(409)
      .expect((res) => {
        expect(res.body).toMatchObject({ code: 'REFUND_EXCEEDS_PAID' });
      });
    const detail = operatorPaymentDetailSchema.parse(
      (await s.get(`/payments/${s.payment.id}`).expect(200)).body,
    );
    expect(detail.refundableMinor).toBe(90_000);
    expect(detail.refunds).toHaveLength(1);

    await s.refund(90_000).expect(201);
    expect(await reload(s.payment.id)).toMatchObject({
      status: 'REFUNDED',
      refundedMinor: 120_000,
    });
  });

  test('the same Idempotency-Key returns the first refund without calling LiqPay again', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, reversed(s.payment.id));
    const key = randomUUID();
    const first = await s.refund(30_000, key).expect(201);
    const again = await s.refund(30_000, key).expect(200);
    expect(again.body).toEqual(first.body);
    expect(refundCalls()).toHaveLength(1);
    await s
      .refund(40_000, key)
      .expect(409)
      .expect((res) => {
        expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      });
    await s.refund(30_000, 'not-a-uuid').expect(400);
  });

  test('two concurrent refunds over the paid amount: exactly one succeeds', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, reversed(s.payment.id));
    const results = await Promise.all([s.refund(70_000), s.refund(70_000)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(refundCalls()).toHaveLength(1);
    expect((await reload(s.payment.id)).refundedMinor).toBe(70_000);
  });

  test('LiqPay unreachable: PENDING, then the job settles it from `status`', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, 'down');
    const pending = refundDtoSchema.parse((await s.refund(50_000).expect(201)).body);
    expect(pending.status).toBe('PENDING');
    // Another refund counts the one in flight: at most 70 000 more.
    await s.refund(80_000).expect(409);

    stub.answers.set(s.payment.id, {
      ...payFields(s.payment, 'reversed'),
      refund_amount: 500,
    });
    const resolved = await app
      .get(RefundsService)
      .resolvePending(new Date(Date.now() + 3 * MINUTE_MS));
    expect(resolved).toBe(1);
    const settled = await prisma.refund.findUniqueOrThrow({ where: { id: pending.id } });
    expect(settled).toMatchObject({ status: 'SUCCEEDED', providerStatus: 'reversed' });
    expect(await reload(s.payment.id)).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      refundedMinor: 50_000,
    });
  });

  test('a refund LiqPay never made is given up after a day', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, 'down');
    const pending = refundDtoSchema.parse((await s.refund(50_000).expect(201)).body);
    stub.answers.set(s.payment.id, payFields(s.payment, 'success'));
    const service = app.get(RefundsService);
    expect(await service.resolvePending(new Date(Date.now() + 3 * MINUTE_MS))).toBe(0);
    expect(await service.resolvePending(new Date(Date.now() + 25 * 3600_000))).toBe(1);
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: 'FAILED',
    });
    expect((await reload(s.payment.id)).refundedMinor).toBe(0);
  });

  test('LiqPay refuses: FAILED, nothing refunded', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, { status: 'error', err_code: 'limit' });
    const failed = refundDtoSchema.parse((await s.refund(30_000).expect(201)).body);
    expect(failed).toMatchObject({ status: 'FAILED', providerStatus: 'error' });
    expect(await reload(s.payment.id)).toMatchObject({ status: 'SUCCEEDED', refundedMinor: 0 });
  });

  test('a payment that was never paid cannot be refunded', async () => {
    const s = await scene();
    await prisma.payment.update({
      where: { id: s.payment.id },
      data: { status: 'FAILED', paidAt: null, failedAt: new Date() },
    });
    await s.refund(1_000).expect(409);
    expect(refundCalls()).toHaveLength(0);
  });

  test('LiqPay reporting our refund as `reversed` is not a chargeback', async () => {
    const s = await scene();
    stub.answers.set(`refund:${s.payment.id}`, reversed(s.payment.id));
    await s.refund(120_000).expect(201);
    await callback(payFields(s.payment, 'reversed', { action: 'refund', payment_id: 777 }));
    await callback(payFields(s.payment, 'reversed', { payment_id: 778 }));
    expect(await reload(s.payment.id)).toMatchObject({
      status: 'REFUNDED',
      refundedMinor: 120_000,
    });
    const pack = await prisma.collectionPack.findUniqueOrThrow({
      where: { collectionId: s.collectionId },
    });
    expect(pack.retentionEndsAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('lists, detail and the operator boundary', () => {
  test('filters: needsReview and mismatch; e-mail; no card data in any DTO', async () => {
    const s = await scene();
    await prisma.payment.update({ where: { id: s.payment.id }, data: { needsReview: true } });
    const review = operatorPaymentListSchema.parse(
      (await s.get('/payments?needsReview=true').expect(200)).body,
    );
    expect(review.items.map((p) => p.id)).toEqual([s.payment.id]);
    expect(review.items[0]?.email).toBe('olena@example.com');
    const mismatch = operatorPaymentListSchema.parse(
      (await s.get('/payments?mismatch=true').expect(200)).body,
    );
    expect(mismatch.items).toEqual([]);
    const byEmail = operatorPaymentListSchema.parse(
      (await s.get('/payments?email=nobody@example.com').expect(200)).body,
    );
    expect(byEmail.items).toEqual([]);
    const detail = await s.get(`/payments/${s.payment.id}`).expect(200);
    const parsed = operatorPaymentDetailSchema.parse(detail.body);
    expect(parsed.events).toHaveLength(1);
    // The callback carried a holder's name and a card mask; neither is ever stored or shown.
    expect(JSON.stringify(detail.body)).not.toMatch(/Олена|424242|card|sender/);
  });

  test('pagination is newest first with a cursor', async () => {
    const s = await scene();
    const page = operatorPaymentListSchema.parse(
      (await s.get('/payments?limit=1').expect(200)).body,
    );
    expect(page.items).toHaveLength(1);
    await s.get('/payments?cursor=garbage').expect(400);
  });

  test('every operator billing route is 404 for an account that is not the operator', async () => {
    const s = await scene();
    const id = s.payment.id;
    const cookie = s.owner.cookie;
    for (const path of ['/payments', `/payments/${id}`, '/subscriptions', '/offers']) {
      await s.get(path, cookie).expect(404);
    }
    await s.refund(1_000, randomUUID(), cookie).expect(404);
    for (const path of [
      `/subscriptions/${id}/refresh`,
      `/subscriptions/${id}/end`,
      `/packs/${s.collectionId}/end`,
    ]) {
      await request(server)
        .post(`/api/v1/operator/billing${path}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ reason: 'x' })
        .expect(404);
    }
    expect(refundCalls()).toHaveLength(0);
  });

  test('ending a pack now: the collection is read-only, audited with the reason', async () => {
    const s = await scene();
    await request(server)
      .post(`/api/v1/operator/billing/packs/${s.collectionId}/end`)
      .set('Origin', ORIGIN)
      .set('Cookie', s.operator.cookie)
      .send({ reason: 'Повернення коштів' })
      .expect(204);
    const pack = await prisma.collectionPack.findUniqueOrThrow({
      where: { collectionId: s.collectionId },
    });
    expect(pack.retentionEndsAt.getTime()).toBeLessThanOrEqual(Date.now());
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'billing.pack_end' },
    });
    expect(audit.metadata).toMatchObject({ reason: 'Повернення коштів' });
  });
});

describe('subscriptions in the console', () => {
  async function subscribed() {
    const s = await scene();
    const prices = await priceSubscriptions(prisma);
    const res = await request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', s.owner.cookie)
      .send({
        kind: 'SUBSCRIPTION',
        priceId: prices['sub-pro'].MONTH,
        autoRenewConsent: true,
        termsVersion: TERMS,
      })
      .expect(201);
    const start = await prisma.payment.findUniqueOrThrow({
      where: { id: checkoutResponseSchema.parse(res.body).paymentId ?? '' },
    });
    await callback(subscribeFields(start));
    return { ...s, start, subscriptionId: start.subscriptionId ?? '' };
  }

  test('the list, «Звірити з LiqPay» and «Завершити зараз» (unsubscribe first)', async () => {
    const s = await subscribed();
    const list = operatorSubscriptionListSchema.parse(
      (await s.get('/subscriptions?source=LIQPAY').expect(200)).body,
    );
    expect(list.items.map((x) => x.id)).toEqual([s.subscriptionId]);
    const post = (path: string, body: object = {}) =>
      request(server)
        .post(`/api/v1/operator/billing/subscriptions/${s.subscriptionId}${path}`)
        .set('Origin', ORIGIN)
        .set('Cookie', s.operator.cookie)
        .send(body);

    stub.answers.set(s.start.id, { ...subscribeFields(s.start), status: 'subscribed' });
    const refreshed = operatorSubscriptionRefreshSchema.parse(
      (await post('/refresh').expect(200)).body,
    );
    expect(refreshed.provider).toMatchObject({ action: 'subscribe', status: 'subscribed' });
    expect(refreshed.renewal).toBe('NOT_EXPECTED');

    stub.answers.set(`unsubscribe:${s.start.id}`, 'down');
    await post('/end', { reason: 'Закриття акаунта' }).expect(503);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: s.subscriptionId } })).status,
    ).toBe('ACTIVE');
    stub.answers.set(`unsubscribe:${s.start.id}`, {
      action: 'unsubscribe',
      status: 'unsubscribed',
    });
    const ended = operatorSubscriptionSchema.parse(
      (await post('/end', { reason: 'Закриття акаунта' }).expect(200)).body,
    );
    expect(ended.status).toBe('EXPIRED');
    expect(ended.providerUnsubscribedAt).not.toBeNull();
  });
});
