import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { collectionSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import type { CollectionStatus } from '../src/generated/prisma/client.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

async function seed(ownerId: string, status: CollectionStatus = 'ACTIVE') {
  return prisma.collection.create({
    data: {
      ownerId,
      title: 'Seeded',
      status,
      ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
    },
  });
}

describe('collection lifecycle API', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const post = (cookie: string, path: string) =>
    request(server())
      .post(`/api/v1/collections${path}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
  const archive = (cookie: string, id: string) => post(cookie, `/${id}/archive`);
  const unarchive = (cookie: string, id: string) => post(cookie, `/${id}/unarchive`);
  const remove = (cookie: string, id: string) =>
    request(server())
      .delete(`/api/v1/collections/${id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
  const auditCount = (action: string) => prisma.auditEvent.count({ where: { action } });

  test('archive is idempotent and audited once', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seed(userId);
    const first = collectionSchema.parse((await archive(cookie, id).expect(200)).body);
    expect(first.status).toBe('ARCHIVED');
    expect(first.archivedAt).toEqual(expect.any(String));
    const second = collectionSchema.parse((await archive(cookie, id).expect(200)).body);
    expect(second.archivedAt).toBe(first.archivedAt);
    expect(await auditCount('collection.archive')).toBe(1);
    const [event] = await prisma.auditEvent.findMany({ where: { action: 'collection.archive' } });
    expect(event).toMatchObject({
      actorId: userId,
      targetId: id,
      metadata: { fromStatus: 'ACTIVE', toStatus: 'ARCHIVED' },
    });
    expect(event?.requestId).toEqual(expect.any(String));
  });

  test('archiving frees a slot; unarchiving at the limit → 409 and stays archived', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const [first] = [await seed(userId), await seed(userId), await seed(userId)];
    await archive(cookie, first.id).expect(200);
    await post(cookie, '').send({ title: 'Fourth' }).expect(201);
    const res = await unarchive(cookie, first.id).expect(409);
    expect(res.body).toMatchObject({ code: 'COLLECTION_LIMIT_REACHED' });
    expect((await prisma.collection.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      'ARCHIVED',
    );
    expect(await auditCount('collection.unarchive')).toBe(0);
  });

  test('a concurrent unarchive and create at 2 of 3 → exactly one succeeds', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    await seed(userId);
    await seed(userId);
    const archived = await seed(userId, 'ARCHIVED');
    const results = await Promise.all([
      unarchive(cookie, archived.id),
      post(cookie, '').send({ title: 'New' }),
    ]);
    expect(results.filter((res) => res.status < 300)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(1);
    expect(await prisma.collection.count({ where: { ownerId: userId, status: 'ACTIVE' } })).toBe(3);
  });

  test('unarchive below the limit → 200, clears archivedAt, audited; repeat is a no-op', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seed(userId, 'ARCHIVED');
    const res = await unarchive(cookie, id).expect(200);
    expect(collectionSchema.parse(res.body)).toMatchObject({ status: 'ACTIVE', archivedAt: null });
    await unarchive(cookie, id).expect(200);
    const events = await prisma.auditEvent.findMany({ where: { action: 'collection.unarchive' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toEqual({ fromStatus: 'ARCHIVED', toStatus: 'ACTIVE' });
  });

  test('an archived collection can still be edited', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seed(userId, 'ARCHIVED');
    const res = await request(server())
      .patch(`/api/v1/collections/${id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Renamed' })
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Renamed', status: 'ARCHIVED' });
  });

  test('delete hides active and archived collections; a repeat is 204 and audited once', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const active = await seed(userId);
    const archived = await seed(userId, 'ARCHIVED');
    const usage = async () =>
      (await request(server()).get('/api/v1/me/usage').set('Cookie', cookie).expect(200)).body as {
        activeCollections: { used: number };
      };
    expect((await usage()).activeCollections.used).toBe(1);

    for (const { id } of [active, archived]) {
      await remove(cookie, id).expect(204);
      await request(server()).get(`/api/v1/collections/${id}`).set('Cookie', cookie).expect(404);
      const row = await prisma.collection.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('DELETING');
      expect(row.deletionRequestedAt).toBeInstanceOf(Date);
      expect(row.archivedAt).toBeNull();
    }
    expect((await usage()).activeCollections.used).toBe(0);
    for (const status of ['ACTIVE', 'ARCHIVED']) {
      const list = await request(server())
        .get(`/api/v1/collections?status=${status}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(list.body).toEqual({ items: [], nextCursor: null });
    }

    await remove(cookie, active.id).expect(204);
    const events = await prisma.auditEvent.findMany({ where: { action: 'collection.delete' } });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.metadata)).toEqual(
      expect.arrayContaining([
        { fromStatus: 'ACTIVE', toStatus: 'DELETING' },
        { fromStatus: 'ARCHIVED', toStatus: 'DELETING' },
      ]),
    );
  });

  test('archive and unarchive of a DELETING collection → 404', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seed(userId);
    await remove(cookie, id).expect(204);
    await archive(cookie, id).expect(404);
    await unarchive(cookie, id).expect(404);
  });

  test('a malformed id → 400', async () => {
    const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
    await archive(cookie, 'not-a-uuid').expect(400);
    await remove(cookie, 'not-a-uuid').expect(400);
  });

  describe('authorization', () => {
    const calls = { archive, unarchive, delete: remove };
    const cases = (['another admin', 'a non-owner operator'] as const).flatMap((actor) =>
      (Object.keys(calls) as (keyof typeof calls)[]).map((call) => ({ actor, call })),
    );

    test.each(cases)('$call by $actor → 404, row and audit unchanged', async ({ actor, call }) => {
      const owner = await signInAs(app, prisma, 'a@stepler.test');
      const target = await seed(owner.userId, call === 'unarchive' ? 'ARCHIVED' : 'ACTIVE');
      const caller = await signInAs(
        app,
        prisma,
        actor === 'a non-owner operator' ? OPERATOR : 'b@stepler.test',
      );
      const before = await prisma.collection.findUniqueOrThrow({ where: { id: target.id } });
      const res = await calls[call](caller.cookie, target.id).expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.collection.findUniqueOrThrow({ where: { id: target.id } })).toEqual(
        before,
      );
      expect(await prisma.auditEvent.count()).toBe(0);
    });
  });
});
