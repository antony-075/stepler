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

// Prices in UAH, USD and EUR (ADR 0018 B2, owner 2026-10-16): each offer may carry a round USD and
// EUR price, listed with the UAH one so the pages can show it for orientation; but we charge and
// issue receipts in hryvnias only («оплата будет производиться в гривне и чек будет гривневый»),
// so a checkout, a subscription or a plan change at a USD or EUR price is refused.

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

  test.each(['USD', 'EUR'] as const)(
    'a pack at its %s price is not sold: 409, no payment',
    async (currency) => {
      const s = await scene();
      const res = await s
        .checkout({
          kind: 'PACK',
          priceId: foreign[`pack-start:${currency}`],
          collectionId: s.collectionId,
        })
        .expect(409);
      expect(res.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
      expect(await prisma.payment.count()).toBe(0);
    },
  );

  test('a storage upgrade is priced in hryvnias; at the USD price of «Подія» it is refused', async () => {
    const s = await scene();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(Date.now() + 10 * DAY_MS),
      retentionEndsAt: new Date(Date.now() + 300 * DAY_MS),
    });
    const refused = await s
      .checkout({
        kind: 'PACK_EXTENSION',
        priceId: foreign['pack-event:USD'],
        collectionId: s.collectionId,
      })
      .expect(409);
    expect(refused.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    const res = await s
      .checkout({
        kind: 'PACK_EXTENSION',
        priceId: catalogue['pack-event'].priceId,
        collectionId: s.collectionId,
      })
      .expect(201);
    const response = checkoutResponseSchema.parse(res.body);
    const fields = response.form?.fields;
    if (fields === undefined) throw new Error('no form');
    expect(decodeData(fields.data)).toMatchObject({ currency: 'UAH' });
  });

  test('a subscription or a plan change at a USD price is refused; at UAH it is sold', async () => {
    const proUsd = await prisma.billingPrice.create({
      data: {
        offerId: subs['sub-pro'].offerId,
        interval: 'MONTH',
        currency: 'USD',
        amountMinor: 2_500,
      },
    });
    const account = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
    const call = (method: 'get' | 'post', path: string) =>
      request(server)
        [method](`/api/v1/billing${path}`)
        .set('Origin', ORIGIN)
        .set('Cookie', account.cookie);
    const subscribe = (priceId: string) =>
      call('post', '/checkouts').send({
        kind: 'SUBSCRIPTION',
        priceId,
        autoRenewConsent: true,
        termsVersion: TERMS,
      });
    expect((await subscribe(proUsd.id).expect(409)).body).toMatchObject({
      code: 'OFFER_UNAVAILABLE',
    });
    const res = await subscribe(subs['sub-pro'].MONTH).expect(201);
    const start = await prisma.payment.findUniqueOrThrow({
      where: { id: checkoutResponseSchema.parse(res.body).paymentId ?? '' },
    });
    expect(start.currency).toBe('UAH');
    await request(server)
      .post('/api/v1/billing/liqpay/callback')
      .type('form')
      .send(signedCallback(subscribeFields(start)))
      .expect(200);
    const businessUsd = await prisma.billingPrice.create({
      data: {
        offerId: subs['sub-business'].offerId,
        interval: 'MONTH',
        currency: 'USD',
        amountMinor: 7_500,
      },
    });
    expect(
      (await call('get', `/subscription/change-preview?priceId=${businessUsd.id}`).expect(409))
        .body,
    ).toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    await call('get', `/subscription/change-preview?priceId=${subs['sub-business'].MONTH}`).expect(
      200,
    );
  });
});
