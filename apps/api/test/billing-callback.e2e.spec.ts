import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { checkoutResponseSchema, usageResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import type { Payment } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  givePack,
  liqpayEnv,
  payFields,
  priceCatalogue,
  type PricedCode,
  signedCallback,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// LiqPay's callback and the payment state machine (ADR 0018, plan Task 12, Review Focus 1):
// replays, duplicates and reordering converge on exactly one grant per payment.

const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

let app: INestApplication;
let server: Server;
let catalogue: Record<PricedCode, { offerId: string; priceId: string }>;
const logs = new CaptureStream();

beforeAll(async () => {
  app = await createApp(testEnv({ ...liqpayEnv(), LOG_LEVEL: 'info' }), { logDestination: logs });
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  catalogue = await priceCatalogue(prisma);
});

async function scene() {
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
    ownerId: owner.userId,
  });
  const checkout = async (body: object): Promise<Payment> => {
    const res = await request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', owner.cookie)
      .send(body)
      .expect(201);
    const { paymentId } = checkoutResponseSchema.parse(res.body);
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId ?? '' } });
  };
  const pack = (code: PricedCode = 'pack-start', collection: string | null = collectionId) =>
    checkout({
      kind: 'PACK',
      priceId: catalogue[code].priceId,
      collectionId: collection,
      ...(collection === null ? { title: 'Ювілей' } : {}),
    });
  return { owner, collectionId, checkout, pack };
}

const post = (body: { data: string; signature: string }, origin?: string) => {
  const req = request(server).post('/api/v1/billing/liqpay/callback').type('form');
  return (origin === undefined ? req : req.set('Origin', origin)).send(body);
};

const reload = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });
const packOf = (collectionId: string) =>
  prisma.collectionPack.findUnique({ where: { collectionId } });

describe('success', () => {
  test('a pending pack for an existing collection: paid, PACK, clocks from the payment', async () => {
    const s = await scene();
    const payment = await s.pack();
    const paidAt = Date.now() - 60_000;
    await post(signedCallback(payFields(payment, 'success', { end_date: paidAt })))
      .expect(200)
      .expect({});

    const paid = await reload(payment.id);
    expect(paid).toMatchObject({ status: 'SUCCEEDED', mismatch: false, needsReview: false });
    expect(paid.paidAt?.getTime()).toBe(paidAt);
    expect(paid.providerPaymentId).not.toBeNull();
    const collection = await prisma.collection.findUniqueOrThrow({ where: { id: s.collectionId } });
    expect(collection.entitlement).toBe('PACK');
    expect(await packOf(s.collectionId)).toMatchObject({
      offerId: catalogue['pack-start'].offerId,
      storageBytes: 10n * 1024n ** 3n,
      guestLinks: 10,
      activatedAt: new Date(paidAt),
      windowEndsAt: new Date(paidAt + 30 * DAY_MS),
      retentionEndsAt: new Date(paidAt + 365 * DAY_MS),
    });
    // The trial's one collection slot is free again: a pack collection is not the account's.
    const usage = usageResponseSchema.parse(
      (await request(server).get('/api/v1/me/usage').set('Cookie', s.owner.cookie).expect(200))
        .body,
    );
    expect(usage.activeCollections).toEqual({ used: 0, limit: 1 });
    const event = await prisma.paymentEvent.findFirstOrThrow();
    expect(event).toMatchObject({ outcome: 'applied', paymentId: payment.id, verified: true });
    expect(event.processedAt).not.toBeNull();
    expect(JSON.stringify(event.payload)).not.toMatch(/Олена|424242|sender/);
  });

  test('a pack that creates its collection: the title, PACK and a default link', async () => {
    const s = await scene();
    const payment = await s.pack('pack-event', null);
    await post(signedCallback(payFields(payment, 'success'))).expect(200);
    const paid = await reload(payment.id);
    expect(paid.status).toBe('SUCCEEDED');
    expect(paid.collectionId).not.toBeNull();
    const created = await prisma.collection.findUniqueOrThrow({
      where: { id: paid.collectionId ?? '' },
      include: { guestLinks: true, pack: true, guestPageVersions: true },
    });
    expect(created).toMatchObject({
      ownerId: s.owner.userId,
      title: 'Ювілей',
      entitlement: 'PACK',
      status: 'ACTIVE',
    });
    expect(created.guestLinks.filter((link) => link.isDefault)).toHaveLength(1);
    expect(created.guestPageVersions.map((v) => v.state)).toEqual(['PUBLISHED']);
    expect(created.pack?.storageBytes).toBe(50n * 1024n ** 3n);
  });

  test('the same body twice: one event, one pack, one audit', async () => {
    const s = await scene();
    const payment = await s.pack();
    const body = signedCallback(payFields(payment, 'success'));
    await post(body).expect(200);
    await post(body).expect(200);
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(await prisma.collectionPack.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'billing.payment_succeeded' } })).toBe(
      1,
    );
  });

  test('the same status re-encoded is a second event and a no-op', async () => {
    const s = await scene();
    const payment = await s.pack();
    const fields = payFields(payment, 'success');
    await post(signedCallback(fields)).expect(200);
    await post(signedCallback({ ...fields, is_3ds: false })).expect(200);
    const events = await prisma.paymentEvent.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(events.map((e) => e.outcome)).toEqual(['applied', 'noop']);
    expect(await prisma.collectionPack.count()).toBe(1);
  });

  test('10 concurrent callbacks (identical and re-encoded) grant exactly once', async () => {
    const s = await scene();
    const payment = await s.pack();
    const fields = payFields(payment, 'success');
    const bodies = Array.from({ length: 10 }, (_, i) =>
      signedCallback(i % 2 === 0 ? fields : { ...fields, version: 7, i }),
    );
    const results = await Promise.all(bodies.map((body) => post(body)));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(await prisma.collectionPack.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'billing.payment_succeeded' } })).toBe(
      1,
    );
    expect((await reload(payment.id)).status).toBe('SUCCEEDED');
  });
});

describe('ordering, mismatch and unknown orders', () => {
  test('failure then success: paid and granted (the money was taken)', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'failure', { err_code: 'limit' }))).expect(200);
    expect(await reload(payment.id)).toMatchObject({ status: 'FAILED', errCode: 'limit' });
    await post(signedCallback(payFields(payment, 'success'))).expect(200);
    expect(await reload(payment.id)).toMatchObject({ status: 'SUCCEEDED', errCode: null });
    expect(await packOf(s.collectionId)).not.toBeNull();
  });

  test('success then failure: stays paid', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'success'))).expect(200);
    await post(signedCallback(payFields(payment, 'failure'))).expect(200);
    expect((await reload(payment.id)).status).toBe('SUCCEEDED');
  });

  test('a pending status changes nothing', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'wait_secure'))).expect(200);
    expect((await reload(payment.id)).status).toBe('PENDING');
  });

  test('another amount or currency: mismatch, nothing granted, 200', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'success', { amount: 1 }))).expect(200);
    await post(signedCallback(payFields(payment, 'success', { currency: 'USD' }))).expect(200);
    await post(signedCallback(payFields(payment, 'success', { amount: 0.1 + 0.2 }))).expect(200);
    expect(await reload(payment.id)).toMatchObject({ status: 'PENDING', mismatch: true });
    expect(await packOf(s.collectionId)).toBeNull();
    expect((await prisma.paymentEvent.findMany()).map((e) => e.outcome)).toEqual([
      'mismatch',
      'mismatch',
      'mismatch',
    ]);
  });

  test('an order that is not ours is stored and answered 200', async () => {
    await post(
      signedCallback(
        payFields(
          { id: '0190f0a0-0000-7000-8000-00000000abcd', amountMinor: 100, currency: 'UAH' },
          'success',
        ),
      ),
    ).expect(200);
    expect(await prisma.paymentEvent.findFirstOrThrow()).toMatchObject({
      outcome: 'unknown_order',
      paymentId: null,
    });
  });

  test('a reversal after success ends the pack', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'success'))).expect(200);
    await post(signedCallback(payFields(payment, 'reversed'))).expect(200);
    expect((await reload(payment.id)).status).toBe('REVERSED');
    const pack = await packOf(s.collectionId);
    expect(pack?.retentionEndsAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('a second pack paid late for a collection that became PACK: review, pack unchanged', async () => {
    const s = await scene();
    const first = await s.pack();
    // An older checkout for the bigger pack that expired here but was paid at LiqPay.
    const late = await prisma.payment.create({
      data: {
        ...first,
        id: '0190f0a0-0000-7000-8000-0000000000aa',
        providerOrderId: '0190f0a0-0000-7000-8000-0000000000aa',
        offerId: catalogue['pack-event'].offerId,
        priceId: catalogue['pack-event'].priceId,
        amountMinor: 120_000,
        status: 'EXPIRED',
        offerSnapshot: { ...(first.offerSnapshot as object), code: 'pack-event' },
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
    await post(signedCallback(payFields(first, 'success'))).expect(200);
    const before = await packOf(s.collectionId);
    await post(signedCallback(payFields(late, 'success'))).expect(200);
    expect(await reload(late.id)).toMatchObject({ status: 'SUCCEEDED', needsReview: true });
    expect(await packOf(s.collectionId)).toEqual(before);
    expect(
      (await prisma.paymentEvent.findFirstOrThrow({ where: { paymentId: late.id } })).outcome,
    ).toBe('review');
  });
});

describe('extensions', () => {
  test('WINDOW reopens a collecting-closed pack for 30 days from now', async () => {
    const s = await scene();
    const now = Date.now();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(now - DAY_MS),
      retentionEndsAt: new Date(now + 300 * DAY_MS),
    });
    const payment = await s.checkout({
      kind: 'PACK_EXTENSION',
      priceId: catalogue['ext-window-30'].priceId,
      collectionId: s.collectionId,
    });
    await post(signedCallback(payFields(payment, 'success', { end_date: now }))).expect(200);
    expect((await packOf(s.collectionId))?.windowEndsAt).toEqual(new Date(now + 30 * DAY_MS));
    const detail = await request(server)
      .get(`/api/v1/collections/${s.collectionId}`)
      .set('Cookie', s.owner.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ access: { state: 'ACTIVE', reason: 'PACK' } });
  });

  test('RETENTION after the keeping ended: collecting-closed again, deletion lifted', async () => {
    const s = await scene();
    const now = Date.now();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(now - 10 * DAY_MS),
      retentionEndsAt: new Date(now - DAY_MS),
    });
    await prisma.collection.update({
      where: { id: s.collectionId },
      data: { deleteAfter: new Date(now + DAY_MS), deletionWarnedAt30: new Date(now - DAY_MS) },
    });
    const payment = await s.checkout({
      kind: 'PACK_EXTENSION',
      priceId: catalogue['ext-retention-365'].priceId,
      collectionId: s.collectionId,
    });
    await post(signedCallback(payFields(payment, 'success', { end_date: now }))).expect(200);
    expect((await packOf(s.collectionId))?.retentionEndsAt).toEqual(new Date(now + 365 * DAY_MS));
    expect(
      await prisma.collection.findUniqueOrThrow({ where: { id: s.collectionId } }),
    ).toMatchObject({
      deleteAfter: null,
      deletionWarnedAt30: null,
    });
    const detail = await request(server)
      .get(`/api/v1/collections/${s.collectionId}`)
      .set('Cookie', s.owner.cookie)
      .expect(200);
    expect(detail.body).toMatchObject({ access: { state: 'COLLECTING_CLOSED' } });
  });

  test('a storage upgrade moves the pack to the bigger tier', async () => {
    const s = await scene();
    const now = Date.now();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(now + DAY_MS),
      retentionEndsAt: new Date(now + 300 * DAY_MS),
    });
    const payment = await s.checkout({
      kind: 'PACK_EXTENSION',
      priceId: catalogue['pack-event'].priceId,
      collectionId: s.collectionId,
    });
    await post(signedCallback(payFields(payment, 'success'))).expect(200);
    expect(await packOf(s.collectionId)).toMatchObject({
      offerId: catalogue['pack-event'].offerId,
      storageBytes: 50n * 1024n ** 3n,
      windowEndsAt: new Date(now + DAY_MS),
    });
  });
});

describe('the endpoint', () => {
  test('a bad signature is 400, stores nothing, and logs no data', async () => {
    const s = await scene();
    const payment = await s.pack();
    const body = signedCallback(payFields(payment, 'success'), 'another-private-key');
    const res = await post(body).expect(400);
    expect(res.body).toMatchObject({ code: 'BILLING_SIGNATURE_INVALID' });
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect((await reload(payment.id)).status).toBe('PENDING');
    expect(logs.output).toContain('"reason":"signature"');
    expect(logs.output).not.toContain(body.data);
    expect(logs.output).not.toContain(body.signature);
  });

  test('a body without data is 400; JSON is not the callback’s format', async () => {
    await post({ data: '', signature: 'x' }).expect(400);
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .send({ data: 'x', signature: 'y' })
      .expect(400);
  });

  test('a foreign Origin is still accepted: the signature is the control', async () => {
    const s = await scene();
    const payment = await s.pack();
    await post(signedCallback(payFields(payment, 'success')), 'https://evil.example').expect(200);
    expect((await reload(payment.id)).status).toBe('SUCCEEDED');
  });

  test('with payments disabled the callback is 503 and stores nothing', async () => {
    const disabled = await createApp(testEnv());
    await listenOnLoopback(disabled);
    try {
      await request(disabled.getHttpServer() as Server)
        .post('/api/v1/billing/liqpay/callback')
        .type('form')
        .send(signedCallback({ order_id: 'x', status: 'success' }))
        .expect(503);
      expect(await prisma.paymentEvent.count()).toBe(0);
    } finally {
      await disabled.close();
    }
  });
});
