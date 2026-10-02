import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  collectionListResponseSchema,
  collectionSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import type { CollectionStatus } from '../src/generated/prisma/client.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

/** Inserts a collection directly, with the timestamps its status requires. */
async function seed(
  ownerId: string,
  status: CollectionStatus = 'ACTIVE',
  title = 'Seeded',
  createdAt?: Date,
) {
  return prisma.collection.create({
    data: {
      ownerId,
      title,
      status,
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
      ...(status === 'DELETING' ? { deletionRequestedAt: new Date() } : {}),
    },
  });
}

describe('collections API', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const create = (cookie: string, body: object) =>
    request(server())
      .post('/api/v1/collections')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);

  describe('POST /collections', () => {
    test('creates an active collection with a trimmed title and an audit event', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      const res = await create(cookie, { title: '  Wedding ' }).expect(201);
      const body = collectionSchema.parse(res.body);
      expect(body).toMatchObject({
        title: 'Wedding',
        description: null,
        status: 'ACTIVE',
        archivedAt: null,
        defaultLinkStatus: 'ACTIVE',
        // [G3] the default link's permissions, so the dashboard can say what guests may add.
        defaultLinkPermissions: {
          canUploadPhotos: true,
          canUploadVideos: true,
          canUploadDocuments: true,
          canSubmitText: true,
          canViewGallery: false,
          canDeleteOwn: true,
        },
      });
      const events = await prisma.auditEvent.findMany({ where: { action: 'collection.create' } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'collection.create',
        actorType: 'ADMIN',
        actorId: userId,
        collectionId: body.id,
        targetType: 'collection',
        targetId: body.id,
        metadata: { toStatus: 'ACTIVE' },
      });
      expect(events[0]?.requestId).toEqual(expect.any(String));
      expect(events[0]?.requestId).not.toBe('');
    });

    test('creates the default guest link in the same transaction, audited with the same request', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      const { id } = collectionSchema.parse(
        (await create(cookie, { title: 'A' }).expect(201)).body,
      );
      const links = await prisma.guestLink.findMany({ where: { collectionId: id } });
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        isDefault: true,
        label: null,
        status: 'ACTIVE',
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
      });
      const [collectionEvent] = await prisma.auditEvent.findMany({
        where: { action: 'collection.create' },
      });
      const [linkEvent] = await prisma.auditEvent.findMany({
        where: { action: 'guest_link.create' },
      });
      expect(linkEvent).toMatchObject({
        collectionId: id,
        actorType: 'ADMIN',
        actorId: userId,
        targetType: 'guest_link',
        targetId: links[0]?.id,
        metadata: { isDefault: true },
      });
      expect(linkEvent?.requestId).toBe(collectionEvent?.requestId);
    });

    test('lists and reads show the default link status and permissions; legacy rows show null', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      const created = collectionSchema.parse(
        (await create(cookie, { title: 'New' }).expect(201)).body,
      );
      await prisma.guestLink.updateMany({
        where: { collectionId: created.id },
        data: { status: 'INACTIVE', canUploadDocuments: false, canViewGallery: true },
      });
      const legacy = await seed(userId, 'ACTIVE', 'Legacy');
      const list = collectionListResponseSchema.parse(
        (await request(server()).get('/api/v1/collections').set('Cookie', cookie).expect(200)).body,
      );
      expect(list.items.map((c) => [c.title, c.defaultLinkStatus])).toEqual([
        ['Legacy', null],
        ['New', 'INACTIVE'],
      ]);
      expect(list.items.map((c) => c.defaultLinkPermissions)).toEqual([
        null,
        {
          canUploadPhotos: true,
          canUploadVideos: true,
          canUploadDocuments: false,
          canSubmitText: true,
          canViewGallery: true,
          canDeleteOwn: true,
        },
      ]);
      const one = await request(server())
        .get(`/api/v1/collections/${legacy.id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(one.body).toMatchObject({ defaultLinkStatus: null, defaultLinkPermissions: null });
    });

    test('requires a session and a same-origin request', async () => {
      await request(server())
        .post('/api/v1/collections')
        .set('Origin', ORIGIN)
        .send({ title: 'A' })
        .expect(401);
      const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
      const res = await request(server())
        .post('/api/v1/collections')
        .set('Cookie', cookie)
        .send({ title: 'A' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    });

    test('rejects invalid bodies', async () => {
      const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
      for (const body of [{}, { title: '   ' }, { title: 'A', ownerId: 'x' }]) {
        const res = await create(cookie, body).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
    });

    test('rejects control characters with 400, not a database error', async () => {
      const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
      for (const body of [
        { title: 'A\u0000B' },
        { title: 'A\nB' },
        { title: 'A', description: 'A\u0000B' },
        { title: 'A', description: 'A\u001bB' },
      ]) {
        const res = await create(cookie, body).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      expect(await prisma.collection.count()).toBe(0);
    });

    test('two concurrent creates at 2 of 3 give exactly one 201 and one 409', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      await seed(userId);
      await seed(userId);
      const results = await Promise.all([
        create(cookie, { title: 'One' }),
        create(cookie, { title: 'Two' }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await prisma.collection.count({ where: { ownerId: userId, status: 'ACTIVE' } })).toBe(
        3,
      );
    });

    test('at the limit → 409; archived collections do not count', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      for (let i = 0; i < 3; i++) await seed(userId);
      await seed(userId, 'ARCHIVED');
      const res = await create(cookie, { title: 'Fourth' }).expect(409);
      expect(res.body).toMatchObject({ code: 'COLLECTION_LIMIT_REACHED' });
      const usage = await request(server())
        .get('/api/v1/me/usage')
        .set('Cookie', cookie)
        .expect(200);
      expect(usageResponseSchema.parse(usage.body)).toEqual({
        activeCollections: { used: 3, limit: 3 },
      });
    });
  });

  describe('GET /collections', () => {
    test('lists one status, newest first, with cursor pagination and no DELETING rows', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 10, minutes));
      await seed(userId, 'ACTIVE', 'A1', at(1));
      await seed(userId, 'ACTIVE', 'A2', at(2));
      await seed(userId, 'ACTIVE', 'A3', at(3));
      await seed(userId, 'ARCHIVED', 'R1', at(4));
      await seed(userId, 'ARCHIVED', 'R2', at(5));
      await seed(userId, 'DELETING', 'D1', at(6));

      const list = (query: string) =>
        request(server()).get(`/api/v1/collections${query}`).set('Cookie', cookie);

      const archived = collectionListResponseSchema.parse(
        (await list('?status=ARCHIVED').expect(200)).body,
      );
      expect(archived.items.map((c) => c.title)).toEqual(['R2', 'R1']);
      expect(archived.nextCursor).toBeNull();

      const first = collectionListResponseSchema.parse((await list('?limit=2').expect(200)).body);
      expect(first.items.map((c) => c.title)).toEqual(['A3', 'A2']);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = collectionListResponseSchema.parse(
        (await list(`?limit=2&cursor=${first.nextCursor ?? ''}`).expect(200)).body,
      );
      expect(second.items.map((c) => c.title)).toEqual(['A1']);
      expect(second.nextCursor).toBeNull();

      const garbage = await list('?cursor=garbage').expect(400);
      expect(garbage.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      await list('?status=DELETING').expect(400);
    });
  });

  describe('PATCH /collections/:id', () => {
    test('keeps line breaks, clears with null, rejects invalid or unknown fields', async () => {
      const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
      const { id } = await seed(userId);
      const patch = (body: object) =>
        request(server())
          .patch(`/api/v1/collections/${id}`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .send(body);

      const updated = await patch({ description: 'Line 1\nLine 2' }).expect(200);
      expect(collectionSchema.parse(updated.body).description).toBe('Line 1\nLine 2');
      const cleared = await patch({ description: null }).expect(200);
      expect(cleared.body).toMatchObject({ description: null, title: 'Seeded' });
      const renamed = await patch({ title: ' Renamed ' }).expect(200);
      expect(renamed.body).toMatchObject({ title: 'Renamed' });
      await patch({ title: '' }).expect(400);
      await patch({ status: 'ARCHIVED' }).expect(400);
      for (const body of [
        { title: 'A\u0000B' },
        { description: 'A\u0000B' },
        { description: 'A\u0007B' },
      ]) {
        const res = await patch(body).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      expect(await prisma.collection.findUniqueOrThrow({ where: { id } })).toMatchObject({
        title: 'Renamed',
        description: null,
      });
      expect((await prisma.collection.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
    });
  });

  describe('authorization', () => {
    type Actor = 'another admin' | 'a non-owner operator' | 'the owner of a DELETING collection';
    const actors: Actor[] = [
      'another admin',
      'a non-owner operator',
      'the owner of a DELETING collection',
    ];
    const calls = {
      'GET /collections/:id': (cookie: string, id: string) =>
        request(server()).get(`/api/v1/collections/${id}`).set('Cookie', cookie),
      'PATCH /collections/:id': (cookie: string, id: string) =>
        request(server())
          .patch(`/api/v1/collections/${id}`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .send({ title: 'Hijacked' }),
    };
    const cases = actors.flatMap((actor) =>
      Object.keys(calls).map((call) => ({ actor, call: call as keyof typeof calls })),
    );

    test.each(cases)('$call by $actor → 404, row unchanged', async ({ actor, call }) => {
      const owner = await signInAs(app, prisma, 'a@stepler.test');
      const deleting = actor === 'the owner of a DELETING collection';
      const target = await seed(owner.userId, deleting ? 'DELETING' : 'ACTIVE');
      const caller = deleting
        ? owner
        : await signInAs(
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
    });

    test('a malformed id → 400', async () => {
      const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
      const res = await request(server())
        .get('/api/v1/collections/not-a-uuid')
        .set('Cookie', cookie)
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    test("another admin's list does not contain the owner's collections", async () => {
      const owner = await signInAs(app, prisma, 'a@stepler.test');
      await seed(owner.userId);
      const other = await signInAs(app, prisma, 'b@stepler.test');
      const res = await request(server())
        .get('/api/v1/collections')
        .set('Cookie', other.cookie)
        .expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    test('the owner can read their collection', async () => {
      const owner = await signInAs(app, prisma, 'a@stepler.test');
      const { id } = await seed(owner.userId);
      const res = await request(server())
        .get(`/api/v1/collections/${id}`)
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(collectionSchema.parse(res.body).id).toBe(id);
    });
  });
});

describe('collection creation rate limit', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(
      testEnv({
        LIMIT_COLLECTION_CREATIONS_PER_DAY: '2',
        LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT: '5',
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('the third create in 24 hours → 429 with Retry-After, even after a delete', async () => {
    const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
    const create = () =>
      request(server())
        .post('/api/v1/collections')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ title: 'A' });
    const first = await create().expect(201);
    await create().expect(201);

    const limited = await create().expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    await prisma.collection.update({
      where: { id: (first.body as { id: string }).id },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    await create().expect(429);
  });
});
