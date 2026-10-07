import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  adminContentDetailSchema,
  adminContentPageSchema,
  collectionListResponseSchema,
  collectionDetailSchema,
  contentCountsSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { ContentKind } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

const OPERATOR = 'op@example.com';
const prisma = createTestPrisma();
const BASE_TIME = Date.parse('2026-10-03T18:00:00.000Z');

/**
 * Inserts `count` items numbered from `from`, one second apart (the higher number is newer).
 * Texts by default; other kinds without a body, as uploads will create them.
 */
async function seedItems(
  collectionId: string,
  count: number,
  options: { from?: number; kind?: ContentKind; name?: string | null; sessionId?: string } = {},
) {
  const { from = 1, kind = 'TEXT' } = options;
  await prisma.contentItem.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      collectionId,
      frameNo: from + i,
      kind,
      textBody: kind === 'TEXT' ? `Побажання ${from + i}` : null,
      processingStatus:
        kind === 'PHOTO' || kind === 'VIDEO' ? ('PENDING' as const) : ('NOT_REQUIRED' as const),
      contributorName: options.name ?? null,
      contributorGuestSessionId: options.sessionId ?? null,
      createdAt: new Date(BASE_TIME + (from + i) * 1000),
    })),
  });
  await prisma.collection.update({
    where: { id: collectionId },
    data: { nextFrameNo: from + count },
  });
}

describe('admin content API', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const get = (cookie: string, path: string) =>
    request(server()).get(`/api/v1${path}`).set('Cookie', cookie);
  const remove = (cookie: string, id: string) =>
    request(server()).delete(`/api/v1/content/${id}`).set('Cookie', cookie).set('Origin', ORIGIN);

  async function ownerWithCollection() {
    const owner = await signInAs(app, prisma, 'olena@example.com');
    const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
    return { ...owner, collectionId };
  }

  test('lists 60 texts newest first as 48 + 12 with a stable cursor', async () => {
    const { cookie, collectionId } = await ownerWithCollection();
    await seedItems(collectionId, 60, { name: 'Ірина' });

    const first = adminContentPageSchema.parse(
      (await get(cookie, `/collections/${collectionId}/content`).expect(200)).body,
    );
    expect(first.items).toHaveLength(48);
    expect(first.items[0]).toMatchObject({
      frameNo: 60,
      kind: 'TEXT',
      text: 'Побажання 60',
      contributorName: 'Ірина',
      processingStatus: 'NOT_REQUIRED',
    });
    expect(first.nextCursor).not.toBeNull();
    // A new item arriving between pages does not shift the next page.
    await seedItems(collectionId, 1, { from: 61 });
    const second = adminContentPageSchema.parse(
      (
        await get(
          cookie,
          `/collections/${collectionId}/content?cursor=${first.nextCursor ?? ''}`,
        ).expect(200)
      ).body,
    );
    expect(second.items.map((item) => item.frameNo)).toEqual(
      Array.from({ length: 12 }, (_, i) => 12 - i),
    );
    expect(second.nextCursor).toBeNull();
  });

  test('sort=frame lists by frame number, ascending, with its own cursor [C5]', async () => {
    const { cookie, collectionId } = await ownerWithCollection();
    // Frame 1 is the newest here, so the two orders differ.
    await prisma.contentItem.createMany({
      data: [1, 2, 3].map((frameNo) => ({
        collectionId,
        frameNo,
        kind: 'TEXT' as const,
        textBody: `#${frameNo}`,
        processingStatus: 'NOT_REQUIRED' as const,
        createdAt: new Date(BASE_TIME - frameNo * 1000),
      })),
    });
    const page = (query: string) =>
      get(cookie, `/collections/${collectionId}/content?${query}`).expect(200);
    const newest = adminContentPageSchema.parse((await page('')).body);
    expect(newest.items.map((i) => i.frameNo)).toEqual([1, 2, 3]);
    const byFrame = adminContentPageSchema.parse((await page('sort=frame&limit=2')).body);
    expect(byFrame.items.map((i) => i.frameNo)).toEqual([1, 2]);
    const rest = adminContentPageSchema.parse(
      (await page(`sort=frame&limit=2&cursor=${byFrame.nextCursor ?? ''}`)).body,
    );
    expect(rest).toMatchObject({ items: [{ frameNo: 3 }], nextCursor: null });
    // A cursor from one order is not valid in the other.
    const invalid = await get(
      cookie,
      `/collections/${collectionId}/content?cursor=${byFrame.nextCursor ?? ''}`,
    ).expect(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    await get(cookie, `/collections/${collectionId}/content?cursor=nope`).expect(400);
  });

  test('kind filters the list; counts are by kind and exclude deleted items', async () => {
    const { cookie, collectionId } = await ownerWithCollection();
    await seedItems(collectionId, 3);
    await seedItems(collectionId, 2, { from: 4, kind: 'PHOTO' });
    await seedItems(collectionId, 1, { from: 6, kind: 'DOCUMENT' });
    await prisma.contentItem.updateMany({
      where: { collectionId, frameNo: 1 },
      data: { deletedAt: new Date() },
    });

    const texts = adminContentPageSchema.parse(
      (await get(cookie, `/collections/${collectionId}/content?kind=TEXT`).expect(200)).body,
    );
    expect(texts.items.map((i) => i.frameNo)).toEqual([3, 2]);
    const counts = contentCountsSchema.parse(
      (await get(cookie, `/collections/${collectionId}/content/counts`).expect(200)).body,
    );
    expect(counts).toEqual({
      total: 5,
      photo: 2,
      video: 0,
      document: 1,
      text: 2,
      lastAddedAt: new Date(BASE_TIME + 6000).toISOString(),
      active: 5,
      hiddenByAdmin: 0,
      hiddenByOperator: 0,
      quarantined: 0,
      reported: 0,
    });
    const empty = await ownerWithCollectionFor('second@example.com');
    expect(
      (await get(empty.cookie, `/collections/${empty.collectionId}/content/counts`).expect(200))
        .body,
    ).toEqual({
      total: 0,
      photo: 0,
      video: 0,
      document: 0,
      text: 0,
      lastAddedAt: null,
      active: 0,
      hiddenByAdmin: 0,
      hiddenByOperator: 0,
      quarantined: 0,
      reported: 0,
    });
  });

  async function ownerWithCollectionFor(email: string) {
    const owner = await signInAs(app, prisma, email);
    const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
    return { ...owner, collectionId };
  }

  test('reads one item with the contributor name; no media links for a text', async () => {
    const { cookie, collectionId } = await ownerWithCollection();
    await seedItems(collectionId, 1, { name: 'Ірина' });
    const item = await prisma.contentItem.findFirstOrThrow();
    const detail = adminContentDetailSchema.parse(
      (await get(cookie, `/content/${item.id}`).expect(200)).body,
    );
    expect(detail).toMatchObject({
      id: item.id,
      frameNo: 1,
      contributorName: 'Ірина',
      originalUrl: null,
      downloadUrl: null,
    });
  });

  test('delete → 204, gone from list and counts at once, audited once without the body', async () => {
    const { cookie, userId, collectionId } = await ownerWithCollection();
    await seedItems(collectionId, 2);
    const item = await prisma.contentItem.findFirstOrThrow({ where: { frameNo: 2 } });

    const res = await remove(cookie, item.id).expect(204);
    expect(res.body).toEqual({});
    const list = adminContentPageSchema.parse(
      (await get(cookie, `/collections/${collectionId}/content`).expect(200)).body,
    );
    expect(list.items.map((i) => i.id)).not.toContain(item.id);
    expect(
      (await get(cookie, `/collections/${collectionId}/content/counts`).expect(200)).body,
    ).toMatchObject({ total: 1, text: 1 });
    await get(cookie, `/content/${item.id}`).expect(404);

    // Idempotent: a repeat is 204 and audits nothing more.
    await remove(cookie, item.id).expect(204);
    const events = await prisma.auditEvent.findMany({ where: { action: 'content.delete' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      collectionId,
      actorType: 'ADMIN',
      actorId: userId,
      targetType: 'content',
      targetId: item.id,
      metadata: { kind: 'TEXT', frameNo: 2, bulk: false },
    });
    expect(JSON.stringify(events[0]?.metadata)).not.toContain('Побажання');
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt,
    ).not.toBeNull();
  });

  test('two concurrent deletes of one item → both 204, one audit event', async () => {
    const { cookie, collectionId } = await ownerWithCollection();
    await seedItems(collectionId, 1);
    const item = await prisma.contentItem.findFirstOrThrow();
    const [a, b] = await Promise.all([remove(cookie, item.id), remove(cookie, item.id)]);
    expect([a.status, b.status]).toEqual([204, 204]);
    expect(await prisma.auditEvent.count({ where: { action: 'content.delete' } })).toBe(1);
  });

  describe('Review Focus 1 (admin): another admin or an operator reaches nothing', () => {
    test('list, counts, get and delete → 404, the item untouched', async () => {
      const { collectionId } = await ownerWithCollection();
      await seedItems(collectionId, 1);
      const item = await prisma.contentItem.findFirstOrThrow();
      const other = await signInAs(app, prisma, 'b@example.com');
      const operator = await signInAs(app, prisma, OPERATOR);

      for (const { cookie } of [other, operator]) {
        for (const path of [
          `/collections/${collectionId}/content`,
          `/collections/${collectionId}/content/counts`,
          `/content/${item.id}`,
        ]) {
          expect((await get(cookie, path).expect(404)).body).toMatchObject({ code: 'NOT_FOUND' });
        }
        await remove(cookie, item.id).expect(404);
      }
      expect(
        (await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } })).deletedAt,
      ).toBeNull();
      expect(await prisma.auditEvent.count()).toBe(0);
    });

    test("the owner's DELETING collection → 404 everywhere", async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      await seedItems(collectionId, 1);
      const item = await prisma.contentItem.findFirstOrThrow();
      await prisma.collection.update({
        where: { id: collectionId },
        data: { status: 'DELETING', deletionRequestedAt: new Date() },
      });
      for (const path of [
        `/collections/${collectionId}/content`,
        `/collections/${collectionId}/content/counts`,
        `/content/${item.id}`,
      ]) {
        await get(cookie, path).expect(404);
      }
      await remove(cookie, item.id).expect(404);
    });

    test('no session → 401; unsafe methods need the origin; ids are validated', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      await seedItems(collectionId, 1);
      const item = await prisma.contentItem.findFirstOrThrow();
      await request(server()).get(`/api/v1/collections/${collectionId}/content`).expect(401);
      await request(server())
        .delete(`/api/v1/content/${item.id}`)
        .set('Cookie', cookie)
        .expect(403);
      await get(cookie, '/content/not-a-uuid').expect(400);
      await get(cookie, `/collections/${collectionId}/content?kind=AUDIO`).expect(400);
    });

    test('a guest session cookie is not an admin session', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      const { collectionId, link } = await seedCollection(prisma, tokens, {
        ownerId: owner.userId,
      });
      const exchanged = await request(server())
        .post(`/api/v1/guest/collections/${collectionId}/session`)
        .set('Origin', ORIGIN)
        .send({ linkToken: link.token })
        .expect(200);
      const guestCookie = (exchanged.headers['set-cookie'] as unknown as string[])[0]?.split(
        ';',
      )[0];
      await get(guestCookie ?? '', `/collections/${collectionId}/content`).expect(401);
    });
  });

  describe('collections carry contentCount and lastContentAt', () => {
    test('list and read; deleted items excluded', async () => {
      const { cookie, userId, collectionId } = await ownerWithCollection();
      const { collectionId: emptyId } = await seedCollection(prisma, tokens, { ownerId: userId });
      await seedItems(collectionId, 4);
      await prisma.contentItem.updateMany({
        where: { collectionId, frameNo: 4 },
        data: { deletedAt: new Date() },
      });

      const list = collectionListResponseSchema.parse(
        (await get(cookie, '/collections').expect(200)).body,
      );
      const byId = new Map(list.items.map((c) => [c.id, c]));
      expect(byId.get(collectionId)).toMatchObject({
        contentCount: 3,
        lastContentAt: new Date(BASE_TIME + 3000).toISOString(),
      });
      expect(byId.get(emptyId)).toMatchObject({ contentCount: 0, lastContentAt: null });
      expect(
        collectionDetailSchema.parse(
          (await get(cookie, `/collections/${collectionId}`).expect(200)).body,
        ),
      ).toMatchObject({ contentCount: 3 });
    });

    test('storageBytes counts live items only, matching the storage line', async () => {
      const { cookie, userId, collectionId } = await ownerWithCollection();
      const { collectionId: emptyId } = await seedCollection(prisma, tokens, { ownerId: userId });
      await seedItems(collectionId, 2, { kind: 'PHOTO' });
      const items = await prisma.contentItem.findMany({
        where: { collectionId },
        orderBy: { frameNo: 'asc' },
      });
      for (const [index, item] of items.entries()) {
        for (const [role, bytes] of [
          ['ORIGINAL', 1_000_000n * BigInt(index + 1)],
          ['THUMBNAIL', 30_000n],
        ] as const) {
          await prisma.mediaObject.create({
            data: {
              contentItemId: item.id,
              role,
              storageKey: `collections/${collectionId}/derived/${item.id}/${role}`,
              mimeType: 'image/jpeg',
              sizeBytes: bytes,
            },
          });
        }
      }
      // The second frame is deleted: its files stop counting at once.
      await prisma.contentItem.update({
        where: { id: items[1]!.id },
        data: { deletedAt: new Date() },
      });

      const list = collectionListResponseSchema.parse(
        (await get(cookie, '/collections').expect(200)).body,
      );
      const byId = new Map(list.items.map((c) => [c.id, c]));
      expect(byId.get(collectionId)?.storageBytes).toBe(1_030_000);
      expect(byId.get(emptyId)?.storageBytes).toBe(0);
      const detail = collectionDetailSchema.parse(
        (await get(cookie, `/collections/${collectionId}`).expect(200)).body,
      );
      // The same definition as the collection's storage line.
      expect(detail.storageBytes).toBe(detail.storage.usedBytes);
    });

    test('one grouped content query per page, however many collections (no N+1)', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      for (let i = 0; i < 20; i++) {
        const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
        await seedItems(collectionId, 1);
      }
      const service = app.get(PrismaService);
      const delegate = service.contentItem;
      const spies = (['groupBy', 'aggregate', 'count', 'findFirst', 'findMany'] as const).map(
        (method) => vi.spyOn(delegate, method),
      );
      const raw = vi.spyOn(service, '$queryRaw');
      try {
        const list = collectionListResponseSchema.parse(
          (await get(owner.cookie, '/collections?limit=20').expect(200)).body,
        );
        expect(list.items).toHaveLength(20);
        expect(list.items.every((c) => c.contentCount === 1)).toBe(true);
        expect(spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(1);
        // The page's sizes: one query too.
        const sizeQueries = raw.mock.calls.filter(([strings]) =>
          (strings as readonly string[]).join('').includes('"MediaObject"'),
        );
        expect(sizeQueries).toHaveLength(1);
      } finally {
        for (const spy of spies) spy.mockRestore();
        raw.mockRestore();
      }
    });
  });
});
