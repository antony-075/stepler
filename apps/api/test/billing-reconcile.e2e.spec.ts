import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { checkoutResponseSchema, paymentDtoSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PaymentEvents } from '../src/billing/payment-events.service.js';
import { ReconciliationService } from '../src/billing/reconciliation.service.js';
import { RefundsService } from '../src/billing/refunds.service.js';
import { SubscriptionClocks } from '../src/billing/subscription-clocks.js';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { BillingReconcileHandler } from '../src/worker/handlers/billing-reconcile.handler.js';
import { listenOnLoopback } from './support/app.js';
import {
  liqpayEnv,
  payFields,
  priceCatalogue,
  type PricedCode,
  signedCallback,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { signInAs } from './support/sessions.js';

// Reconciliation through LiqPay's status API (ADR 0018 [P7], plan Task 13, Review Focus 5): the
// real `LiqPayProvider` against a local stand-in of LiqPay's endpoint.

const MINUTE_MS = 60_000;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

let app: INestApplication;
let server: Server;
let handler: BillingReconcileHandler;
let catalogue: Record<PricedCode, { offerId: string; priceId: string }>;

beforeAll(async () => {
  await stub.start();
  app = await createApp(testEnv(liqpayEnv(stub.base)));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
  // The worker's handler over the API's services: the same classes the worker module wires.
  handler = new BillingReconcileHandler(
    app.get(PrismaService),
    app.get(ReconciliationService),
    app.get(PaymentEvents),
    app.get(SubscriptionClocks),
    app.get(RefundsService),
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
  catalogue = await priceCatalogue(prisma);
});

/** A pending pack checkout, made `ageMs` old (the return page waits 30 s before asking). */
async function pendingPack(ageMs = MINUTE_MS) {
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
    ownerId: owner.userId,
  });
  const res = await request(server)
    .post('/api/v1/billing/checkouts')
    .set('Origin', ORIGIN)
    .set('Cookie', owner.cookie)
    .send({ kind: 'PACK', priceId: catalogue['pack-start'].priceId, collectionId })
    .expect(201);
  const { paymentId } = checkoutResponseSchema.parse(res.body);
  const payment = await prisma.payment.update({
    where: { id: paymentId ?? '' },
    data: { createdAt: new Date(Date.now() - ageMs) },
  });
  const poll = async () =>
    paymentDtoSchema.parse(
      (
        await request(server)
          .get(`/api/v1/billing/payments/${paymentId}`)
          .set('Cookie', owner.cookie)
          .expect(200)
      ).body,
    );
  return { owner, collectionId, payment, poll };
}

const answer = (payment: Payment, status: string) => {
  // The stub adds `order_id` itself, as LiqPay echoes it.
  stub.answers.set(payment.providerOrderId, payFields(payment, status));
};

describe('the return page’s poll', () => {
  test('no callback, LiqPay says success: paid and granted once', async () => {
    const s = await pendingPack();
    answer(s.payment, 'success');
    expect((await s.poll()).status).toBe('SUCCEEDED');
    expect(await prisma.collectionPack.count({ where: { collectionId: s.collectionId } })).toBe(1);
    expect(stub.calls).toEqual([{ action: 'status', orderId: s.payment.id }]);
  });

  test('a fresh checkout is not asked; polls within 15 s make one call', async () => {
    const fresh = await pendingPack(5_000);
    answer(fresh.payment, 'processing');
    expect((await fresh.poll()).status).toBe('PENDING');
    expect(stub.calls).toHaveLength(0);

    await prisma.payment.update({
      where: { id: fresh.payment.id },
      data: { createdAt: new Date(Date.now() - MINUTE_MS) },
    });
    await fresh.poll();
    await fresh.poll();
    expect(stub.calls).toHaveLength(1);
  });

  test('LiqPay down: the payment stays pending and the client gets 200', async () => {
    const s = await pendingPack();
    stub.answers.set(s.payment.providerOrderId, 'down');
    expect((await s.poll()).status).toBe('PENDING');
  });

  test('a failure answer marks it failed', async () => {
    const s = await pendingPack();
    answer(s.payment, 'failure');
    expect((await s.poll()).status).toBe('FAILED');
  });

  test('the poll and the job racing grant once', async () => {
    const s = await pendingPack(5 * MINUTE_MS);
    answer(s.payment, 'success');
    await Promise.all([s.poll(), handler.run(new Date()), s.poll(), handler.run(new Date())]);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'SUCCEEDED',
    );
    expect(await prisma.collectionPack.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'billing.payment_succeeded' } })).toBe(
      1,
    );
  });
});

describe('the reconcile job', () => {
  test('an expired checkout LiqPay does not know becomes EXPIRED; a late success still counts', async () => {
    const s = await pendingPack(60 * MINUTE_MS);
    await prisma.payment.update({
      where: { id: s.payment.id },
      data: { expiresAt: new Date(Date.now() - 20 * MINUTE_MS) },
    });
    const run = await handler.run(new Date());
    expect(run.stale).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'EXPIRED',
    );

    // The money was taken after all: LiqPay's callback arrives later.
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .type('form')
      .send(signedCallback(payFields(s.payment, 'success')))
      .expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'SUCCEEDED',
    );
    expect(await prisma.collectionPack.count()).toBe(1);
  });

  test('a stale checkout that LiqPay reports paid is granted, not expired', async () => {
    const s = await pendingPack(60 * MINUTE_MS);
    await prisma.payment.update({
      where: { id: s.payment.id },
      data: { expiresAt: new Date(Date.now() - 20 * MINUTE_MS) },
    });
    answer(s.payment, 'success');
    await handler.run(new Date());
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'SUCCEEDED',
    );
  });

  test('a stale checkout stays pending while LiqPay is down', async () => {
    const s = await pendingPack(60 * MINUTE_MS);
    await prisma.payment.update({
      where: { id: s.payment.id },
      data: { expiresAt: new Date(Date.now() - 20 * MINUTE_MS) },
    });
    stub.answers.set(s.payment.providerOrderId, 'down');
    await handler.run(new Date());
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'PENDING',
    );
  });

  test('a stored callback whose transition never committed is applied', async () => {
    const s = await pendingPack();
    const fields = payFields(s.payment, 'success');
    await prisma.paymentEvent.create({
      data: {
        dedupeKey: 'stuck',
        verified: true,
        orderId: s.payment.providerOrderId,
        payload: { ...fields, sender_first_name: undefined, sender_card_mask2: undefined },
        receivedAt: new Date(Date.now() - 2 * MINUTE_MS),
      },
    });
    const run = await handler.run(new Date());
    expect(run.events).toBe(1);
    expect(await prisma.paymentEvent.findFirstOrThrow()).toMatchObject({
      outcome: 'applied',
      paymentId: s.payment.id,
    });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: s.payment.id } })).status).toBe(
      'SUCCEEDED',
    );
  });
});
