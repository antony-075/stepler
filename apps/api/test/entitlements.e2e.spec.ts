import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { collectionDetailSchema, usageResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { UsageService } from '../src/limits/usage.service.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { givePack } from './support/billing.js';
import { ORIGIN } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Limits from entitlements (ADR 0018, plan Task 3): the trial's 1 collection and 1 GiB, and a
// pack collection that counts against its pack only.

const GiB = 1024n ** 3n;
const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;

beforeAll(async () => {
  app = await createApp(testEnv());
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

const create = (cookie: string, title: string) =>
  request(server)
    .post('/api/v1/collections')
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .send({ title });

/** Runs the reservation check as an upload initiation does, in its own transaction. */
const reserve = (userId: string, collectionId: string, bytes: bigint) =>
  app
    .get(PrismaService)
    .$transaction((tx) =>
      app.get(UsageService).assertCanReserve(tx, { userId, collectionId, bytes }),
    );

describe('on the trial', () => {
  test('usage shows the trial access and its limits', async () => {
    const { cookie } = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
    const res = await request(server).get('/api/v1/me/usage').set('Cookie', cookie).expect(200);
    const usage = usageResponseSchema.parse(res.body);
    expect(usage).toMatchObject({
      activeCollections: { used: 0, limit: 1 },
      storage: { usedBytes: 0, limitBytes: Number(GiB) },
      access: { state: 'ACTIVE', reason: 'TRIAL' },
    });
    const endsAt = new Date(usage.access.endsAt ?? 0).getTime();
    expect(Math.abs(endsAt - (Date.now() + 7 * DAY_MS))).toBeLessThan(60_000);
  });

  test('one active collection', async () => {
    const { cookie } = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
    await create(cookie, 'Весілля').expect(201);
    const second = await create(cookie, 'Хрестини').expect(409);
    expect(second.body).toMatchObject({ code: 'COLLECTION_LIMIT_REACHED' });
  });

  test('1 GiB of storage', async () => {
    const { cookie, userId } = await signInAs(
      app,
      prisma,
      'olena@example.com',
      true,
      true,
      'trial',
    );
    const { id } = (await create(cookie, 'Весілля').expect(201)).body as { id: string };
    await expect(reserve(userId, id, GiB)).resolves.toBeUndefined();
    await expect(reserve(userId, id, GiB + 1n)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});

describe('a pack collection', () => {
  async function scene() {
    const owner = await signInAs(app, prisma, 'olena@example.com', true, true, 'trial');
    const account = (await create(owner.cookie, 'Весілля').expect(201)).body as { id: string };
    const packed = await prisma.collection.create({
      data: { ownerId: owner.userId, title: 'Ювілей' },
    });
    await givePack(prisma, packed.id, {
      windowEndsAt: new Date(Date.now() + 30 * DAY_MS),
      retentionEndsAt: new Date(Date.now() + 365 * DAY_MS),
    });
    return { ...owner, accountCollectionId: account.id, packCollectionId: packed.id };
  }

  test('takes reservations up to its pack, beyond the trial', async () => {
    const s = await scene();
    await expect(reserve(s.userId, s.packCollectionId, 5n * GiB)).resolves.toBeUndefined();
    await expect(reserve(s.userId, s.packCollectionId, 10n * GiB + 1n)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    // The account collection is still bound by the trial's 1 GiB.
    await expect(reserve(s.userId, s.accountCollectionId, 2n * GiB)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });

  test('does not count toward the account', async () => {
    const s = await scene();
    const res = await request(server).get('/api/v1/me/usage').set('Cookie', s.cookie).expect(200);
    expect(usageResponseSchema.parse(res.body).activeCollections).toEqual({ used: 1, limit: 1 });
  });

  test('says so, with its clocks', async () => {
    const s = await scene();
    const res = await request(server)
      .get(`/api/v1/collections/${s.packCollectionId}`)
      .set('Cookie', s.cookie)
      .expect(200);
    const detail = collectionDetailSchema.parse(res.body);
    expect(detail).toMatchObject({
      entitlement: 'PACK',
      access: { state: 'ACTIVE', reason: 'PACK' },
      pack: { offerTitle: { uk: 'Старт', en: 'Start' }, storageBytes: Number(10n * GiB) },
      deleteAfter: null,
      storage: { limitBytes: Number(10n * GiB) },
    });
    const list = await request(server).get('/api/v1/collections').set('Cookie', s.cookie);
    const items = (list.body as { items: { id: string; entitlement: string; access: unknown }[] })
      .items;
    expect(items.find((item) => item.id === s.accountCollectionId)).toMatchObject({
      entitlement: 'ACCOUNT',
      access: { state: 'ACTIVE', reason: 'TRIAL' },
    });
  });
});
