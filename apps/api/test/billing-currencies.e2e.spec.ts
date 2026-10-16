import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { checkoutResponseSchema, currentLegalVersion, offerListSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { decodeData } from '../src/billing/liqpay/liqpay-signature.js';
import { createApp } from '../src/create-app.js';
import type { Currency } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import {
  givePack,
  liqpayEnv,
  payFields,
  priceCatalogue,
  type PricedCode,
  priceSubscriptions,
  signedCallback,
  type SubscriptionPrices,
  subscribeFields,
} from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { LiqPayStub } from './support/liqpay-stub.js';
import { signInAs } from './support/sessions.js';

// Prices in UAH, USD and EUR (ADR 0018 B2, owner decision 2026-10-16): each offer has its own
// round price per currency, the customer pays in the price's currency through LiqPay, and a
// subscription changes plan only within the currency it was bought in.

const DAY_MS = 24 * 3600_000;
const TERMS = currentLegalVersion('TERMS').version;
const prisma = createTestPrisma();
const stub = new LiqPayStub();

/** Pack prices in cents per currency, besides the UAH ones of `priceCatalogue`. */
const FOREIGN: Record<Exclude<Currency, 'UAH'>, Partial<Record<PricedCode, number>>> = {
  USD: { 'pack-start': 1_200, 'pack-event': 3_600 },
  // No «Подія» in EUR: a storage upgrade to it cannot be priced in EUR.
  EUR: { 'pack-start': 1_100 },
};

let app: INestApplication;
let server: Server;
let catalogue: Record<PricedCode, { offerId: string; priceId: string }>;
let foreign: Record<string, string>;
let subs: SubscriptionPrices;

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
  catalogue = await priceCatalogue(prisma);
  subs = await priceSubscriptions(prisma);
  foreign = {};
  for (const [currency, amounts] of Object.entries(FOREIGN) as [Currency, typeof FOREIGN.USD][]) {
    for (const [code, amountMinor] of Object.entries(amounts) as [PricedCode, number][]) {
      const price = await prisma.billingPrice.create({
        data: { offerId: catalogue[code].offerId, interval: 'ONE_TIME', currency, amountMinor },
      });
      foreign[`${code}:${currency}`] = price.id;
    }
  }
});

async function scene(email = 'olena@example.com') {
  const owner = await signInAs(app, prisma, email, true, true, 'trial');
  const { collectionId } = await seedCollection(prisma, app.get(GuestLinkTokens), {
    ownerId: owner.userId,
  });
  const checkout = (body: object) =>
    request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', owner.cookie)
      .send(body);
  return { owner, collectionId, checkout };
}

function formData(body: unknown) {
  const response = checkoutResponseSchema.parse(body);
  const fields = response.form?.fields;
  if (fields === undefined) throw new Error('no form');
  return { response, data: decodeData(fields.data) };
}

describe('currencies', () => {
  test('the catalogue lists every live price of every currency', async () => {
    const res = await request(server).get('/api/v1/billing/offers').expect(200);
    const start = offerListSchema.parse(res.body).items.find((o) => o.code === 'pack-start');
    expect(start?.prices.map((p) => `${p.currency} ${p.amountMinor}`).sort()).toEqual([
      'EUR 1100',
      'UAH 50000',
      'USD 1200',
    ]);
  });

  test.each([
    ['USD', '12.00'],
    ['EUR', '11.00'],
  ] as const)(
    'a pack checkout in %s: LiqPay gets the price’s currency',
    async (currency, amount) => {
      const s = await scene();
      const res = await s
        .checkout({
          kind: 'PACK',
          priceId: foreign[`pack-start:${currency}`],
          collectionId: s.collectionId,
        })
        .expect(201);
      const { response, data } = formData(res.body);
      expect(data).toMatchObject({ action: 'pay', amount, currency });
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { id: response.paymentId ?? '' } }),
      ).toMatchObject({ currency, amountMinor: Number.parseFloat(amount) * 100 });
    },
  );

  test('a USD callback settles the USD payment; a UAH one for it is a mismatch', async () => {
    const s = await scene();
    const res = await s
      .checkout({ kind: 'PACK', priceId: foreign['pack-start:USD'], collectionId: s.collectionId })
      .expect(201);
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: checkoutResponseSchema.parse(res.body).paymentId ?? '' },
    });
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .type('form')
      .send(signedCallback(payFields(payment, 'success')))
      .expect(200);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
      status: 'SUCCEEDED',
      mismatch: false,
      currency: 'USD',
    });
    expect(
      (await prisma.collection.findUniqueOrThrow({ where: { id: s.collectionId } })).entitlement,
    ).toBe('PACK');

    const other = await scene('taras@example.com');
    const second = await other
      .checkout({
        kind: 'PACK',
        priceId: foreign['pack-start:USD'],
        collectionId: other.collectionId,
      })
      .expect(201);
    const pending = await prisma.payment.findUniqueOrThrow({
      where: { id: checkoutResponseSchema.parse(second.body).paymentId ?? '' },
    });
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .type('form')
      .send(signedCallback(payFields({ ...pending, currency: 'UAH' }, 'success')))
      .expect(200);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      mismatch: true,
    });
    expect(
      (await prisma.collection.findUniqueOrThrow({ where: { id: other.collectionId } }))
        .entitlement,
    ).not.toBe('PACK');
  });

  test('a storage upgrade costs the tier difference in the currency paid; none in EUR', async () => {
    const s = await scene();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(Date.now() + 10 * DAY_MS),
      retentionEndsAt: new Date(Date.now() + 300 * DAY_MS),
    });
    const usd = await s
      .checkout({
        kind: 'PACK_EXTENSION',
        priceId: foreign['pack-event:USD'],
        collectionId: s.collectionId,
      })
      .expect(201);
    expect(formData(usd.body).data).toMatchObject({ amount: '24.00', currency: 'USD' });
    await prisma.payment.updateMany({
      where: { collectionId: s.collectionId, status: 'PENDING' },
      data: { status: 'FAILED', failedAt: new Date() },
    });

    // «Подія» has no EUR price: an EUR upgrade cannot be priced (the UAH «Подія» is no answer).
    await prisma.billingPrice.create({
      data: {
        offerId: catalogue['pack-event'].offerId,
        interval: 'ONE_TIME',
        currency: 'EUR',
        amountMinor: 3_200,
      },
    });
    await prisma.billingPrice.updateMany({
      where: { offerId: catalogue['pack-start'].offerId, currency: 'EUR' },
      data: { active: false },
    });
    const eventEur = await prisma.billingPrice.findFirstOrThrow({
      where: { offerId: catalogue['pack-event'].offerId, currency: 'EUR', active: true },
    });
    expect(
      (
        await s
          .checkout({
            kind: 'PACK_EXTENSION',
            priceId: eventEur.id,
            collectionId: s.collectionId,
          })
          .expect(409)
      ).body,
    ).toMatchObject({ code: 'OFFER_UNAVAILABLE' });

    await prisma.billingPrice.updateMany({
      where: { offerId: catalogue['pack-start'].offerId, currency: 'EUR' },
      data: { active: true },
    });
    const eur = await s
      .checkout({ kind: 'PACK_EXTENSION', priceId: eventEur.id, collectionId: s.collectionId })
      .expect(201);
    expect(formData(eur.body).data).toMatchObject({ amount: '21.00', currency: 'EUR' });
  });

  test('a plan change stays in the subscription’s currency: another is 409 CURRENCY_MISMATCH', async () => {
    const proUsd = await prisma.billingPrice.create({
      data: {
        offerId: subs['sub-pro'].offerId,
        interval: 'MONTH',
        currency: 'USD',
        amountMinor: 2_500,
      },
    });
    const businessUsd = await prisma.billingPrice.create({
      data: {
        offerId: subs['sub-business'].offerId,
        interval: 'MONTH',
        currency: 'USD',
        amountMinor: 7_500,
      },
    });
    const account = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
    const call = (method: 'get' | 'post', path: string) =>
      request(server)
        [method](`/api/v1/billing${path}`)
        .set('Origin', ORIGIN)
        .set('Cookie', account.cookie);
    const res = await call('post', '/checkouts')
      .send({
        kind: 'SUBSCRIPTION',
        priceId: proUsd.id,
        autoRenewConsent: true,
        termsVersion: TERMS,
      })
      .expect(201);
    const { response, data } = formData(res.body);
    expect(data).toMatchObject({ action: 'subscribe', amount: '25.00', currency: 'USD' });
    const start = await prisma.payment.findUniqueOrThrow({
      where: { id: response.paymentId ?? '' },
    });
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .type('form')
      .send(signedCallback(subscribeFields(start)))
      .expect(200);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { userId: account.userId } });
    expect(sub).toMatchObject({ status: 'ACTIVE', currency: 'USD', amountMinor: 2_500 });

    for (const priceId of [subs['sub-business'].MONTH, subs['sub-pro'].YEAR]) {
      expect(
        (await call('get', `/subscription/change-preview?priceId=${priceId}`).expect(409)).body,
      ).toMatchObject({ code: 'CURRENCY_MISMATCH' });
      expect(
        (
          await call('post', '/checkouts')
            .send({ kind: 'SUBSCRIPTION_CHANGE', priceId })
            .expect(409)
        ).body,
      ).toMatchObject({ code: 'CURRENCY_MISMATCH' });
    }
    // Within USD the change is priced as usual.
    await call('get', `/subscription/change-preview?priceId=${businessUsd.id}`).expect(200);
  });
});
