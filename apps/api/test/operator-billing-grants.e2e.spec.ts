import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  operatorBillingAccountSchema,
  operatorOfferListSchema,
  subscriptionDtoSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { listenOnLoopback } from './support/app.js';
import { endAllAccess } from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Complimentary grants in the operator console (ADR 0018 [P13], plan Task 5).

const OPERATOR = 'op@stepler.test';
const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;

beforeAll(async () => {
  app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
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

const offerId = async (code: string) =>
  (await prisma.billingOffer.findUniqueOrThrow({ where: { code } })).id;

async function scene() {
  const operator = await signInAs(app, prisma, OPERATOR);
  const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
  await endAllAccess(prisma, owner.userId);
  const post = (path: string, cookie = operator.cookie) =>
    request(server)
      .post(`/api/v1/operator/billing${path}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  const usage = async () =>
    usageResponseSchema.parse(
      (await request(server).get('/api/v1/me/usage').set('Cookie', owner.cookie).expect(200)).body,
    );
  return { operator, owner, post, usage };
}

describe('complimentary grants', () => {
  test('a grant without an end lifts read-only with the offer’s limits; revoking ends it', async () => {
    const s = await scene();
    expect((await s.usage()).access).toMatchObject({ state: 'READ_ONLY', reason: 'TRIAL_ENDED' });
    const business = await offerId('sub-business');
    const granted = await s
      .post('/grants')
      .send({ userId: s.owner.userId, offerId: business, endsAt: null, reason: 'Власник' })
      .expect(201);
    const grant = subscriptionDtoSchema.parse(granted.body);
    expect(grant).toMatchObject({
      source: 'COMPLIMENTARY',
      status: 'ACTIVE',
      offerTitle: 'Business',
      currentPeriodEnd: null,
      price: null,
    });
    expect(await s.usage()).toMatchObject({
      activeCollections: { limit: 20 },
      access: { state: 'ACTIVE', reason: 'COMPLIMENTARY', endsAt: null },
    });

    const lookup = await request(server)
      .get('/api/v1/operator/billing/accounts')
      .query({ email: 'olena@example.com' })
      .set('Cookie', s.operator.cookie)
      .expect(200);
    expect(operatorBillingAccountSchema.parse(lookup.body)).toMatchObject({
      userId: s.owner.userId,
      access: { reason: 'COMPLIMENTARY' },
      subscription: { id: grant.id },
    });

    await s.post(`/grants/${grant.id}/revoke`).send({ reason: 'Тест завершено' }).expect(201);
    // Deviation from the plan's TRIAL_ENDED: the grant ended after the trial, so it is the
    // source whose end starts the retention clock (`resolveAccess`).
    expect((await s.usage()).access).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
    });
    await s.post(`/grants/${grant.id}/revoke`).send({ reason: 'Ще раз' }).expect(404);

    const audit = await prisma.auditEvent.findMany({
      where: { targetId: grant.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((event) => [event.action, event.actorType])).toEqual([
      ['billing.grant', 'OPERATOR'],
      ['billing.grant_revoke', 'OPERATOR'],
    ]);
    expect(audit[0]?.metadata).toMatchObject({ reason: 'Власник', endsAt: null });
  });

  test('a new grant replaces the live one; a dated grant ends on its date', async () => {
    const s = await scene();
    const endsAt = new Date(Date.now() + 30 * DAY_MS).toISOString();
    const first = await s
      .post('/grants')
      .send({ userId: s.owner.userId, offerId: await offerId('sub-pro'), endsAt, reason: 'Тест' })
      .expect(201);
    expect(first.body).toMatchObject({ currentPeriodEnd: endsAt });
    expect((await s.usage()).access).toMatchObject({ reason: 'COMPLIMENTARY', endsAt });
    await s
      .post('/grants')
      .send({
        userId: s.owner.userId,
        offerId: await offerId('sub-business'),
        endsAt: null,
        reason: 'Більше',
      })
      .expect(201);
    const rows = await prisma.subscription.findMany({ where: { userId: s.owner.userId } });
    expect(rows.map((row) => row.status).sort()).toEqual(['ACTIVE', 'EXPIRED']);
    expect((await s.usage()).activeCollections.limit).toBe(20);
  });

  test('refuses an end in the past, a pack offer and a missing reason', async () => {
    const s = await scene();
    const base = { userId: s.owner.userId, offerId: await offerId('sub-pro'), reason: 'Тест' };
    const past = await s
      .post('/grants')
      .send({ ...base, endsAt: new Date(Date.now() - DAY_MS).toISOString() })
      .expect(400);
    expect(past.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    const pack = await s
      .post('/grants')
      .send({ ...base, offerId: await offerId('pack-start'), endsAt: null })
      .expect(400);
    expect(pack.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    await s
      .post('/grants')
      .send({ ...base, endsAt: null, reason: '' })
      .expect(400);
    expect(await prisma.subscription.count({ where: { userId: s.owner.userId } })).toBe(0);
  });

  test('a grant lifts the account’s scheduled deletions', async () => {
    const s = await scene();
    const collection = await prisma.collection.create({
      data: {
        ownerId: s.owner.userId,
        title: 'Весілля',
        deleteAfter: new Date(Date.now() + DAY_MS),
      },
    });
    await s
      .post('/grants')
      .send({
        userId: s.owner.userId,
        offerId: await offerId('sub-pro'),
        endsAt: null,
        reason: 'Т',
      })
      .expect(201);
    const after = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
    expect(after.deleteAfter).toBeNull();
  });

  test('the operator lists every offer, drafts included', async () => {
    const s = await scene();
    const res = await request(server)
      .get('/api/v1/operator/billing/offers')
      .set('Cookie', s.operator.cookie)
      .expect(200);
    const codes = operatorOfferListSchema.parse(res.body).items.map((offer) => offer.code);
    expect(codes).toEqual(expect.arrayContaining(['trial', 'sub-pro', 'sub-business']));
  });
});

describe('who may', () => {
  test('a non-operator and an unverified operator address get 404 everywhere', async () => {
    const s = await scene();
    const unverified = await signInAs(app, prisma, 'op2@stepler.test', false);
    const app2 = await createApp(testEnv({ OPERATOR_EMAILS: `${OPERATOR},op2@stepler.test` }));
    await listenOnLoopback(app2);
    try {
      const pro = await offerId('sub-pro');
      const body = { userId: s.owner.userId, offerId: pro, endsAt: null, reason: 'Т' };
      for (const [srv, cookie] of [
        [server, s.owner.cookie],
        [app2.getHttpServer() as Server, unverified.cookie],
      ] as const) {
        await request(srv)
          .get('/api/v1/operator/billing/accounts')
          .query({ email: 'olena@example.com' })
          .set('Cookie', cookie)
          .expect(404);
        await request(srv)
          .post('/api/v1/operator/billing/grants')
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .send(body)
          .expect(404);
      }
      expect(await prisma.subscription.count({ where: { userId: s.owner.userId } })).toBe(0);
    } finally {
      await app2.close();
    }
  });

  test('a paid subscription is never overridden by a grant', async () => {
    const s = await scene();
    const pro = await offerId('sub-pro');
    const price = await prisma.billingPrice.create({
      data: { offerId: pro, interval: 'MONTH', currency: 'UAH', amountMinor: 49900 },
    });
    await prisma.subscription.create({
      data: {
        userId: s.owner.userId,
        source: 'LIQPAY',
        status: 'ACTIVE',
        offerId: pro,
        priceId: price.id,
        interval: 'MONTH',
        amountMinor: 49900,
        currency: 'UAH',
        activeCollections: 5,
        storageBytes: 1n,
        collectionStorageBytes: 1n,
        guestLinks: 1,
        autoRenewConsentAt: new Date(),
      },
    });
    const res = await s
      .post('/grants')
      .send({ userId: s.owner.userId, offerId: pro, endsAt: null, reason: 'Т' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'SUBSCRIPTION_EXISTS' });
  });
});
