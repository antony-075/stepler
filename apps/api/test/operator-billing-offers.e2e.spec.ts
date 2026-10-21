import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  checkoutResponseSchema,
  offerListSchema,
  type OfferUpsert,
  type OperatorOffer,
  operatorOfferListSchema,
  operatorOfferSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { readSnapshot } from '../src/billing/offer-snapshot.js';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { givePack, liqpayEnv, priceCatalogue } from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// The offers and prices editor in /ops (owner decision B10, plan Task 20): what was bought never
// changes, prices are new rows, the trial is edited live, non-operators see nothing.

const OPERATOR = 'op@stepler.test';
const GiB = 1024n ** 3n;
const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;

beforeAll(async () => {
  app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR, ...liqpayEnv() }));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

/** The editable body of an offer as the console sends it (the whole form). */
function formOf(offer: OperatorOffer, changes: Partial<OfferUpsert> = {}): OfferUpsert {
  return {
    titleUk: offer.titleUk,
    titleEn: offer.titleEn,
    descriptionUk: offer.descriptionUk,
    descriptionEn: offer.descriptionEn,
    rank: offer.rank,
    highlighted: offer.highlighted,
    ribbonUk: offer.ribbonUk,
    ribbonEn: offer.ribbonEn,
    activeCollections: offer.limits.activeCollections,
    storageBytes: offer.limits.storageBytes,
    collectionStorageBytes: offer.limits.collectionStorageBytes,
    guestLinks: offer.limits.guestLinks,
    windowDays: offer.limits.windowDays,
    retentionDays: offer.limits.retentionDays,
    durationDays: offer.durationDays,
    rroItemId: offer.rroItemId,
    reason: 'Нові ліміти',
    ...changes,
  };
}

async function scene() {
  const operator = await signInAs(app, prisma, OPERATOR);
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  const catalogue = await priceCatalogue(prisma);
  const call = (method: 'get' | 'post' | 'patch' | 'put', path: string, cookie = operator.cookie) =>
    request(server)
      [method](`/api/v1/operator/billing${path}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  const offers = async () =>
    operatorOfferListSchema.parse((await call('get', '/offers').expect(200)).body).items;
  const offer = async (code: string) => {
    const found = (await offers()).find((o) => o.code === code);
    if (found === undefined) throw new Error(`no offer ${code}`);
    return found;
  };
  const checkout = (collectionId: string) =>
    request(server)
      .post('/api/v1/billing/checkouts')
      .set('Origin', ORIGIN)
      .set('Cookie', owner.cookie)
      .send({ kind: 'PACK', priceId: catalogue['pack-start'].priceId, collectionId });
  return { operator, owner, catalogue, call, offers, offer, checkout };
}

describe('editing an offer never changes what was bought', () => {
  test('«Старт» 10 → 20 GiB: the old pack and a pending checkout keep 10; a new checkout takes 20', async () => {
    const s = await scene();
    const tokens = app.get(GuestLinkTokens);
    const bought = await seedCollection(prisma, tokens, { ownerId: s.owner.userId });
    await givePack(prisma, bought.collectionId, {
      windowEndsAt: new Date(Date.now() + 30 * DAY_MS),
      retentionEndsAt: new Date(Date.now() + 365 * DAY_MS),
    });
    const second = await seedCollection(prisma, tokens, { ownerId: s.owner.userId });
    const pendingRes = await s.checkout(second.collectionId).expect(201);
    const pendingId = checkoutResponseSchema.parse(pendingRes.body).paymentId ?? '';

    const start = await s.offer('pack-start');
    const edited = operatorOfferSchema.parse(
      (
        await s
          .call('patch', `/offers/${start.id}`)
          .send(
            formOf(start, {
              collectionStorageBytes: String(20n * GiB),
              highlighted: true,
              ribbonUk: 'Вибір пар',
              ribbonEn: "Couples' choice",
            }),
          )
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({
      highlighted: true,
      ribbonUk: 'Вибір пар',
      ribbonEn: "Couples' choice",
    });
    expect(edited.limits.collectionStorageBytes).toBe(String(20n * GiB));

    const pack = await prisma.collectionPack.findUniqueOrThrow({
      where: { collectionId: bought.collectionId },
    });
    expect(pack.storageBytes).toBe(10n * GiB);
    const pending = await prisma.payment.findUniqueOrThrow({ where: { id: pendingId } });
    expect(readSnapshot(pending.offerSnapshot).collectionStorageBytes).toBe(String(10n * GiB));

    const third = await seedCollection(prisma, tokens, { ownerId: s.owner.userId });
    const fresh = checkoutResponseSchema.parse(
      (await s.checkout(third.collectionId).expect(201)).body,
    );
    const newPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: fresh.paymentId ?? '' },
    });
    expect(readSnapshot(newPayment.offerSnapshot).collectionStorageBytes).toBe(String(20n * GiB));

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'billing.offer_update' },
    });
    expect(audit).toMatchObject({ targetId: start.id, actorType: 'OPERATOR' });
    expect(audit.metadata).toMatchObject({ reason: 'Нові ліміти' });
  });

  test('a new price is a new row; the old one stays, inactive, for the payments made with it', async () => {
    const s = await scene();
    const start = await s.offer('pack-start');
    const old = s.catalogue['pack-start'].priceId;
    const set = (amountMinor: number) =>
      s
        .call('put', `/offers/${start.id}/prices`)
        .send({ interval: 'ONE_TIME', currency: 'UAH', amountMinor, reason: 'Нова ціна' });
    const after = operatorOfferSchema.parse((await set(59_900).expect(200)).body);
    expect(after.prices).toEqual([
      expect.objectContaining({ interval: 'ONE_TIME', currency: 'UAH', amountMinor: 59_900 }),
    ]);
    expect(after.prices[0]?.id).not.toBe(old);
    expect(await prisma.billingPrice.findUniqueOrThrow({ where: { id: old } })).toMatchObject({
      active: false,
      amountMinor: 50_000,
    });
    // The same amount again is a no-op: no third row, no second audit.
    await set(59_900).expect(200);
    expect(await prisma.billingPrice.count({ where: { offerId: start.id } })).toBe(2);
    const audits = await prisma.auditEvent.findMany({ where: { action: 'billing.price_set' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ oldAmountMinor: 50_000, newAmountMinor: 59_900 });

    await s
      .call('put', `/offers/${start.id}/prices`)
      .send({ interval: 'MONTH', currency: 'UAH', amountMinor: 100, reason: 'x' })
      .expect(400);
    const storage = await s.offer('ext-storage');
    await s
      .call('put', `/offers/${storage.id}/prices`)
      .send({ interval: 'ONE_TIME', currency: 'UAH', amountMinor: 100, reason: 'x' })
      .expect(400);
  });
});

describe('prices per currency (ADR 0018, B2)', () => {
  test('each currency is its own slot; one is switched off without touching the others', async () => {
    const s = await scene();
    const start = await s.offer('pack-start');
    const set = (currency: string, amountMinor: number) =>
      s
        .call('put', `/offers/${start.id}/prices`)
        .send({ interval: 'ONE_TIME', currency, amountMinor, reason: 'Ціна у валюті' })
        .expect(200);
    await set('USD', 1_200);
    const both = operatorOfferSchema.parse((await set('EUR', 1_100)).body);
    expect(both.prices.map((p) => `${p.currency} ${p.amountMinor}`).sort()).toEqual([
      'EUR 1100',
      'UAH 50000',
      'USD 1200',
    ]);

    const deactivate = (currency: string) =>
      s
        .call('post', `/offers/${start.id}/prices/deactivate`)
        .send({ interval: 'ONE_TIME', currency, reason: 'Не продаємо в євро' });
    const after = operatorOfferSchema.parse((await deactivate('EUR').expect(200)).body);
    expect(after.prices.map((p) => p.currency).sort()).toEqual(['UAH', 'USD']);
    expect(
      await prisma.billingPrice.count({
        where: { offerId: start.id, currency: 'EUR', active: false },
      }),
    ).toBe(1);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'billing.price_deactivate' },
    });
    expect(audit.metadata).toMatchObject({ currency: 'EUR', oldAmountMinor: 1_100 });
    // Nothing live there any more; no reason is 400; a stranger gets 404.
    await deactivate('EUR').expect(404);
    await s
      .call('post', `/offers/${start.id}/prices/deactivate`)
      .send({ interval: 'ONE_TIME', currency: 'USD' })
      .expect(400);
    await s
      .call('post', `/offers/${start.id}/prices/deactivate`, s.owner.cookie)
      .send({ interval: 'ONE_TIME', currency: 'USD', reason: 'x' })
      .expect(404);
  });
});

describe('the catalogue and the trial', () => {
  test('a deactivated offer leaves the catalogue and cannot be bought; activating brings it back', async () => {
    const s = await scene();
    const tokens = app.get(GuestLinkTokens);
    const { collectionId } = await seedCollection(prisma, tokens, { ownerId: s.owner.userId });
    const start = await s.offer('pack-start');
    await s
      .call('post', `/offers/${start.id}/deactivate`)
      .send({ reason: 'Знято з продажу' })
      .expect(200);
    const listed = offerListSchema.parse(
      (await request(server).get('/api/v1/billing/offers').expect(200)).body,
    );
    expect(listed.items.map((o) => o.code)).not.toContain('pack-start');
    const refused = await s.checkout(collectionId).expect(409);
    expect(refused.body).toMatchObject({ code: 'OFFER_UNAVAILABLE' });

    await s
      .call('post', `/offers/${start.id}/activate`)
      .send({ reason: 'Знову в продажу' })
      .expect(200);
    await s.checkout(collectionId).expect(201);
  });

  test('editing the trial changes the limits of trials already running (not a purchase)', async () => {
    const s = await scene();
    const usage = async () =>
      usageResponseSchema.parse(
        (await request(server).get('/api/v1/me/usage').set('Cookie', s.owner.cookie).expect(200))
          .body,
      );
    const before = (await usage()).activeCollections.limit;
    const trial = await s.offer('trial');
    await s
      .call('patch', `/offers/${trial.id}`)
      .send(formOf(trial, { activeCollections: before + 3 }))
      .expect(200);
    expect((await usage()).activeCollections.limit).toBe(before + 3);
    await s.call('post', `/offers/${trial.id}/deactivate`).send({ reason: 'x' }).expect(400);
  });

  test('the database decides which limits a kind needs: a pack without a window is 400', async () => {
    const s = await scene();
    const start = await s.offer('pack-start');
    const res = await s
      .call('patch', `/offers/${start.id}`)
      .send(formOf(start, { windowDays: null }))
      .expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await s.offer('pack-start')).limits.windowDays).toBe(start.limits.windowDays);
  });

  test('a new offer starts off sale; its code is unique and never changes', async () => {
    const s = await scene();
    const body = {
      code: 'pack-wedding',
      kind: 'PACK',
      extension: null,
      ...formOf(await s.offer('pack-event'), { titleUk: 'Весілля', titleEn: 'Wedding', rank: 5 }),
      reason: 'Новий пакет',
    };
    const created = operatorOfferSchema.parse(
      (await s.call('post', '/offers').send(body).expect(201)).body,
    );
    expect(created).toMatchObject({ code: 'pack-wedding', active: false, prices: [] });
    const again = await s.call('post', '/offers').send(body).expect(400);
    expect(again.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    await s
      .call('patch', `/offers/${created.id}`)
      .send({ ...formOf(created), code: 'renamed' })
      .expect(400);
  });
});

test('every offer route is 404 for an account that is not the operator', async () => {
  const s = await scene();
  const start = await s.offer('pack-start');
  const cookie = s.owner.cookie;
  await s.call('get', '/offers', cookie).expect(404);
  await s.call('post', '/offers', cookie).send({}).expect(404);
  await s.call('patch', `/offers/${start.id}`, cookie).send(formOf(start)).expect(404);
  await s.call('post', `/offers/${start.id}/deactivate`, cookie).send({ reason: 'x' }).expect(404);
  await s
    .call('put', `/offers/${start.id}/prices`, cookie)
    .send({ interval: 'ONE_TIME', currency: 'UAH', amountMinor: 1, reason: 'x' })
    .expect(404);
  expect((await s.offer('pack-start')).active).toBe(true);
});
