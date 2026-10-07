import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  checkoutResponseSchema,
  offerListSchema,
  paymentDtoSchema,
  paymentListSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { decodeData, liqpaySign } from '../src/billing/liqpay/liqpay-signature.js';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  endAllAccess,
  givePack,
  liqpayEnv,
  priceCatalogue,
  type PricedCode,
  TEST_LIQPAY,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Pack checkouts (ADR 0018, plan Task 11): server-side pricing, ownership, one pending checkout
// per target, and the honest `disabled` mode.

const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;
let catalogue: Record<PricedCode, { offerId: string; priceId: string }>;

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
  catalogue = await priceCatalogue(prisma);
});

async function scene() {
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
    ownerId: owner.userId,
  });
  const checkout = (body: object, cookie = owner.cookie) =>
    request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(body);
  return { owner, collectionId, checkout };
}

const packFor = (collectionId: string | null, code: PricedCode = 'pack-start', title?: string) => ({
  kind: 'PACK',
  priceId: catalogue[code].priceId,
  collectionId,
  ...(title === undefined ? {} : { title }),
});

function decodedForm(body: unknown) {
  const response = checkoutResponseSchema.parse(body);
  const fields = response.form?.fields;
  if (fields === undefined) throw new Error('no form');
  return { response, fields, data: decodeData(fields.data) };
}

describe('POST /billing/checkouts', () => {
  test('a pack for the owner’s collection: a pending payment priced on the server', async () => {
    const s = await scene();
    const res = await s.checkout(packFor(s.collectionId)).expect(201);
    const { response, fields, data } = decodedForm(res.body);
    expect(response.status).toBe('PENDING');
    expect(response.form?.action).toBe('https://www.liqpay.ua/api/3/checkout');
    expect(fields.signature).toBe(liqpaySign(TEST_LIQPAY.privateKey, fields.data));
    expect(data).toMatchObject({
      public_key: TEST_LIQPAY.publicKey,
      version: 7,
      action: 'pay',
      amount: '500.00',
      currency: 'UAH',
      order_id: response.paymentId,
      language: 'uk',
      description: 'Stepler: Старт',
      result_url: `http://localhost:3000/app/billing/return?payment=${response.paymentId}`,
    });
    // No BILLING_CALLBACK_URL here (local development): no server_url.
    expect(data).not.toHaveProperty('server_url');
    expect(JSON.stringify(res.body)).not.toContain(TEST_LIQPAY.privateKey);
    expect(Buffer.from(fields.data, 'base64').toString()).not.toContain(TEST_LIQPAY.privateKey);

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: response.paymentId } });
    expect(row).toMatchObject({
      userId: s.owner.userId,
      kind: 'PACK',
      status: 'PENDING',
      collectionId: s.collectionId,
      amountMinor: 50_000,
      currency: 'UAH',
      providerOrderId: response.paymentId,
      offerId: catalogue['pack-start'].offerId,
    });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(29 * 60_000);
    expect(row.offerSnapshot).toMatchObject({
      code: 'pack-start',
      collectionStorageBytes: String(10n * 1024n ** 3n),
      windowDays: 30,
      retentionDays: 365,
    });
    expect(
      await prisma.auditEvent.count({ where: { action: 'billing.checkout', targetId: row.id } }),
    ).toBe(1);
  });

  test('amounts and limits in the body are refused', async () => {
    const s = await scene();
    await s.checkout({ ...packFor(s.collectionId), amountMinor: 1 }).expect(400);
    await s.checkout({ ...packFor(s.collectionId), currency: 'UAH' }).expect(400);
    await s.checkout({ ...packFor(null) }).expect(400); // a new collection needs a title
    expect(await prisma.payment.count()).toBe(0);
  });

  test('another owner’s, an unknown and a deleting collection are 404', async () => {
    const s = await scene();
    const other = await seedCollection(prisma, app.get(GuestLinkTokens));
    await s.checkout(packFor(other.collectionId)).expect(404);
    await s.checkout(packFor('0190f0a0-0000-7000-8000-000000000009')).expect(404);
    await prisma.collection.update({
      where: { id: s.collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    await s.checkout(packFor(s.collectionId)).expect(404);
    expect(await prisma.payment.count()).toBe(0);
  });

  test('an inactive price or offer, a second pack and subscriptions are OFFER_UNAVAILABLE', async () => {
    const s = await scene();
    await prisma.billingPrice.update({
      where: { id: catalogue['pack-event'].priceId },
      data: { active: false },
    });
    const refused = await s.checkout(packFor(s.collectionId, 'pack-event')).expect(409);
    expect(refused.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    await prisma.billingOffer.update({ where: { code: 'pack-start' }, data: { active: false } });
    await s.checkout(packFor(s.collectionId)).expect(409);
    await prisma.billingOffer.update({ where: { code: 'pack-start' }, data: { active: true } });

    // An extension price is not a pack.
    await s
      .checkout({ ...packFor(s.collectionId), priceId: catalogue['ext-window-30'].priceId })
      .expect(409);

    const packed = await seedCollection(prisma, app.get(GuestLinkTokens), {
      ownerId: s.owner.userId,
    });
    await givePack(prisma, packed.collectionId, {
      windowEndsAt: new Date(Date.now() + 10 * DAY_MS),
      retentionEndsAt: new Date(Date.now() + 300 * DAY_MS),
    });
    expect((await s.checkout(packFor(packed.collectionId)).expect(409)).body).toMatchObject({
      code: 'OFFER_UNAVAILABLE',
    });
    const sub = await s
      .checkout({
        kind: 'SUBSCRIPTION',
        priceId: catalogue['pack-start'].priceId,
        autoRenewConsent: true,
        termsVersion: 'v2',
      })
      .expect(409);
    expect(sub.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    // A collection the operator blocked is not sold anything.
    const blocked = await seedCollection(prisma, app.get(GuestLinkTokens), {
      ownerId: s.owner.userId,
    });
    await prisma.collection.update({
      where: { id: blocked.collectionId },
      data: { blockedAt: new Date(), blockedReason: 'Порушення' },
    });
    await s.checkout(packFor(blocked.collectionId)).expect(409);
    expect(await prisma.payment.count()).toBe(0);
  });

  test('the same checkout twice is one payment with two valid forms', async () => {
    const s = await scene();
    const first = decodedForm((await s.checkout(packFor(s.collectionId)).expect(201)).body);
    const second = decodedForm((await s.checkout(packFor(s.collectionId)).expect(201)).body);
    expect(second.response.paymentId).toBe(first.response.paymentId);
    for (const { fields } of [first, second]) {
      expect(fields.signature).toBe(liqpaySign(TEST_LIQPAY.privateKey, fields.data));
    }
    expect(await prisma.payment.count()).toBe(1);
  });

  test('another offer while one is pending is PAYMENT_PENDING; after expiry a new one starts', async () => {
    const s = await scene();
    const first = decodedForm((await s.checkout(packFor(s.collectionId)).expect(201)).body);
    const busy = await s.checkout(packFor(s.collectionId, 'pack-event')).expect(409);
    expect(busy.body).toMatchObject({ code: 'PAYMENT_PENDING' });

    await prisma.payment.update({
      where: { id: first.response.paymentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const next = decodedForm(
      (await s.checkout(packFor(s.collectionId, 'pack-event')).expect(201)).body,
    );
    expect(next.response.paymentId).not.toBe(first.response.paymentId);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: first.response.paymentId } })).status,
    ).toBe('EXPIRED');
  });

  test('a pack that creates its collection keeps the title for the grant', async () => {
    const s = await scene();
    const res = await s.checkout(packFor(null, 'pack-event', 'Ювілей бабусі')).expect(201);
    const { response } = decodedForm(res.body);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: response.paymentId } }),
    ).toMatchObject({
      collectionId: null,
      newCollectionTitle: 'Ювілей бабусі',
      amountMinor: 120_000,
    });
    // Repeating it reuses the pending payment; nothing is created until it is paid.
    const again = decodedForm(
      (await s.checkout(packFor(null, 'pack-event', 'Ювілей бабусі')).expect(201)).body,
    );
    expect(again.response.paymentId).toBe(response.paymentId);
    expect(await prisma.collection.count({ where: { ownerId: s.owner.userId } })).toBe(1);
  });

  test('extensions need a pack collection; a storage upgrade costs the tier difference', async () => {
    const s = await scene();
    const window = { kind: 'PACK_EXTENSION', priceId: catalogue['ext-window-30'].priceId };
    expect(
      (await s.checkout({ ...window, collectionId: s.collectionId }).expect(409)).body,
    ).toMatchObject({ code: 'OFFER_UNAVAILABLE' });

    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(Date.now() - DAY_MS),
      retentionEndsAt: new Date(Date.now() + 300 * DAY_MS),
    });
    const ext = decodedForm(
      (await s.checkout({ ...window, collectionId: s.collectionId }).expect(201)).body,
    );
    expect(ext.data).toMatchObject({ amount: '150.00' });
    await prisma.payment.update({
      where: { id: ext.response.paymentId },
      data: { status: 'FAILED', failedAt: new Date() },
    });

    const upgrade = await s
      .checkout({
        kind: 'PACK_EXTENSION',
        priceId: catalogue['pack-event'].priceId,
        collectionId: s.collectionId,
      })
      .expect(201);
    const { response, data } = decodedForm(upgrade.body);
    expect(data).toMatchObject({ amount: '700.00' });
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: response.paymentId } }),
    ).toMatchObject({
      kind: 'PACK_EXTENSION',
      amountMinor: 70_000,
      offerId: catalogue['pack-event'].offerId,
      offerSnapshot: expect.objectContaining({
        code: 'pack-event',
        extension: 'STORAGE',
      }) as unknown,
    });

    // The same or a smaller tier is no upgrade.
    await prisma.payment.updateMany({ data: { status: 'FAILED', failedAt: new Date() } });
    await s
      .checkout({
        kind: 'PACK_EXTENSION',
        priceId: catalogue['pack-start'].priceId,
        collectionId: s.collectionId,
      })
      .expect(409);
  });

  test('a read-only account can still pay (billing is on the gate’s allow-list)', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.owner.userId);
    await s.checkout(packFor(s.collectionId)).expect(201);
  });

  test('signed out is 401', async () => {
    const s = await scene();
    await s.checkout(packFor(s.collectionId), '').expect(401);
  });
});

describe('payments are the account’s own', () => {
  test('list and detail; another account’s payment is 404', async () => {
    const s = await scene();
    const { response } = decodedForm((await s.checkout(packFor(s.collectionId)).expect(201)).body);
    const list = paymentListSchema.parse(
      (
        await request(server)
          .get('/api/v1/billing/payments')
          .set('Cookie', s.owner.cookie)
          .expect(200)
      ).body,
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: response.paymentId,
      kind: 'PACK',
      status: 'PENDING',
      amountMinor: 50_000,
      currency: 'UAH',
      offerTitle: 'Старт',
      collectionId: s.collectionId,
      refundedMinor: 0,
      paidAt: null,
    });
    paymentDtoSchema.parse(
      (
        await request(server)
          .get(`/api/v1/billing/payments/${response.paymentId}`)
          .set('Cookie', s.owner.cookie)
          .expect(200)
      ).body,
    );
    const stranger = await signInAs(app, prisma, 'taras@example.com');
    await request(server)
      .get(`/api/v1/billing/payments/${response.paymentId}`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    const theirs = paymentListSchema.parse(
      (
        await request(server)
          .get('/api/v1/billing/payments')
          .set('Cookie', stranger.cookie)
          .expect(200)
      ).body,
    );
    expect(theirs.items).toEqual([]);
    await request(server).get(`/api/v1/billing/payments/${response.paymentId}`).expect(401);
  });
});

describe('POST /billing/payments/:id/checkout (pay the same order again)', () => {
  test('own pending: the same order, freshly signed; otherwise 404 or 409', async () => {
    const s = await scene();
    const { response } = decodedForm((await s.checkout(packFor(s.collectionId)).expect(201)).body);
    const resume = (cookie: string) =>
      request(server)
        .post(`/api/v1/billing/payments/${response.paymentId}/checkout`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie);
    const again = decodedForm((await resume(s.owner.cookie).expect(201)).body);
    expect(again.response.paymentId).toBe(response.paymentId);
    expect(again.data).toMatchObject({ order_id: response.paymentId, amount: '500.00' });
    expect(again.fields.signature).toBe(liqpaySign(TEST_LIQPAY.privateKey, again.fields.data));

    const stranger = await signInAs(app, prisma, 'taras@example.com');
    await resume(stranger.cookie).expect(404);

    await prisma.payment.update({
      where: { id: response.paymentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await resume(s.owner.cookie).expect(409)).body).toMatchObject({
      code: 'OFFER_UNAVAILABLE',
    });
    await prisma.payment.update({
      where: { id: response.paymentId },
      data: { expiresAt: new Date(Date.now() + 60_000), status: 'FAILED', failedAt: new Date() },
    });
    await resume(s.owner.cookie).expect(409);
    expect(await prisma.payment.count()).toBe(1);
  });
});

describe('GET /billing/offers', () => {
  test('public: live offers with live prices only, in the asked language', async () => {
    await prisma.billingPrice.update({
      where: { id: catalogue['ext-retention-365'].priceId },
      data: { active: false },
    });
    const res = await request(server).get('/api/v1/billing/offers?locale=en').expect(200);
    const list = offerListSchema.parse(res.body);
    expect(list.items.map((offer) => offer.code)).toEqual([
      'pack-start',
      'pack-event',
      'ext-window-30',
    ]);
    expect(list.items[0]).toMatchObject({
      title: 'Start',
      prices: [{ interval: 'ONE_TIME', amountMinor: 50_000, currency: 'UAH' }],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/rroItemId|features|trial/);
  });
});

describe('BILLING_PROVIDER=disabled', () => {
  test('checkout is 503 PAYMENT_PROVIDER_UNAVAILABLE and nothing is written', async () => {
    const disabled = await createApp(testEnv());
    await listenOnLoopback(disabled);
    try {
      const owner = await signInAs(disabled, prisma, 'olena@example.com', true, true, 'trial');
      const { collectionId } = await seedCollection(prisma, disabled.get(GuestLinkTokens), {
        ownerId: owner.userId,
      });
      const res = await request(disabled.getHttpServer() as Server)
        .post('/api/v1/billing/checkouts')
        .set('Origin', ORIGIN)
        .set('Cookie', owner.cookie)
        .send(packFor(collectionId))
        .expect(503);
      expect(res.body).toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
      expect(await prisma.payment.count()).toBe(0);
    } finally {
      await disabled.close();
    }
  });
});
