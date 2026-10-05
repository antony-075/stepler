import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  guestContentDetailSchema,
  guestContentPageSchema,
  type GuestLinkPermissions,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import {
  addLink,
  CONTRIBUTE_ONLY,
  joinAsGuest,
  ORIGIN,
  seedCollection,
  SHARED_GALLERY,
} from './support/guests.js';

const prisma = createTestPrisma();

describe('guest content API [C16]', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv());
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

  const list = (collectionId: string, cookie: string, query: string) =>
    request(server())
      .get(`/api/v1/guest/collections/${collectionId}/content?${query}`)
      .set('Cookie', cookie);
  const read = (collectionId: string, cookie: string, id: string) =>
    request(server())
      .get(`/api/v1/guest/collections/${collectionId}/content/${id}`)
      .set('Cookie', cookie);
  const name = (collectionId: string, cookie: string, value: string) =>
    request(server())
      .patch(`/api/v1/guest/collections/${collectionId}/session`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: value })
      .expect(200);
  const text = async (collectionId: string, cookie: string, body: string) => {
    const res = await request(server())
      .post(`/api/v1/guest/collections/${collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ body })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  /** A collection where guest A (named «Ірина») and guest B (named «Богдан») each wrote twice. */
  async function twoGuests(permissions: GuestLinkPermissions) {
    const seeded = await seedCollection(prisma, tokens, { permissions });
    const a = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const b = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    await name(seeded.collectionId, a, 'Ірина');
    await name(seeded.collectionId, b, 'Богдан');
    const aIds = [
      await text(seeded.collectionId, a, 'A1'),
      await text(seeded.collectionId, a, 'A2'),
    ];
    const bIds = [
      await text(seeded.collectionId, b, 'B1'),
      await text(seeded.collectionId, b, 'B2'),
    ];
    return { ...seeded, a, b, aIds, bIds };
  }

  test("scope=own lists only this session's items, newest first, with their numbers", async () => {
    const { collectionId, a, aIds } = await twoGuests(CONTRIBUTE_ONLY);
    const page = guestContentPageSchema.parse(
      (await list(collectionId, a, 'scope=own').expect(200)).body,
    );
    expect(page.items.map((i) => i.id)).toEqual([...aIds].reverse());
    expect(page.items.map((i) => i.frameNo)).toEqual([2, 1]);
    expect(page.items.every((i) => i.isOwn && i.canDelete)).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  test('scope=all without the shared gallery → 403', async () => {
    const { collectionId, a } = await twoGuests(CONTRIBUTE_ONLY);
    const res = await list(collectionId, a, 'scope=all').expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  test("scope=all with the shared gallery: everyone's items, foreign ones without number or name", async () => {
    const { collectionId, a, aIds, bIds } = await twoGuests(SHARED_GALLERY);
    const res = await list(collectionId, a, 'scope=all&limit=3').expect(200);
    const page = guestContentPageSchema.parse(res.body);
    expect(page.items.map((i) => i.id)).toEqual([bIds[1], bIds[0], aIds[1]]);
    expect(page.items[0]).toMatchObject({ isOwn: false, frameNo: null, canDelete: false });
    expect(page.items[2]).toMatchObject({ isOwn: true, frameNo: 2 });
    // No other guest's name, ever.
    expect(JSON.stringify(res.body)).not.toContain('Богдан');
    expect(JSON.stringify(res.body)).not.toContain('Ірина');
    const rest = guestContentPageSchema.parse(
      (await list(collectionId, a, `scope=all&limit=3&cursor=${page.nextCursor ?? ''}`).expect(200))
        .body,
    );
    expect(rest.items.map((i) => i.id)).toEqual([aIds[0]]);
    expect(rest.nextCursor).toBeNull();
  });

  test("other guests' file names stay private; the guest's own keep theirs (spec §8)", async () => {
    const { collectionId, a, b } = await twoGuests(SHARED_GALLERY);
    const sessionOf = async (cookie: string) =>
      (
        await prisma.guestSession.findFirstOrThrow({
          where: { contentItems: { some: { textBody: cookie === a ? 'A1' : 'B1' } } },
        })
      ).id;
    for (const [cookie, frameNo, name] of [
      [a, 5, 'Ірина-програма.pdf'],
      [b, 6, 'Богдан-фото.pdf'],
    ] as const) {
      await prisma.contentItem.create({
        data: {
          collectionId,
          frameNo,
          kind: 'DOCUMENT',
          processingStatus: 'NOT_REQUIRED',
          originalFilename: name,
          contributorGuestSessionId: await sessionOf(cookie),
        },
      });
    }
    const res = await list(collectionId, a, 'scope=all').expect(200);
    const items = guestContentPageSchema.parse(res.body).items;
    expect(items.find((i) => i.frameNo === 5)).toMatchObject({
      isOwn: true,
      originalFilename: 'Ірина-програма.pdf',
    });
    const foreign = items.find((i) => i.kind === 'DOCUMENT' && !i.isOwn);
    expect(foreign).toMatchObject({ originalFilename: null });
    expect(JSON.stringify(res.body)).not.toContain('Богдан-фото');
  });

  test('deleted items are not listed or readable', async () => {
    const { collectionId, a, aIds } = await twoGuests(SHARED_GALLERY);
    await prisma.contentItem.update({ where: { id: aIds[1] }, data: { deletedAt: new Date() } });
    const page = guestContentPageSchema.parse(
      (await list(collectionId, a, 'scope=own').expect(200)).body,
    );
    expect(page.items.map((i) => i.id)).toEqual([aIds[0]]);
    await read(collectionId, a, aIds[1] ?? '').expect(404);
  });

  test('reads an own item; a foreign one only with the shared gallery', async () => {
    const shared = await twoGuests(SHARED_GALLERY);
    const own = guestContentDetailSchema.parse(
      (await read(shared.collectionId, shared.a, shared.aIds[0] ?? '').expect(200)).body,
    );
    expect(own).toMatchObject({ isOwn: true, frameNo: 1, text: 'A1', originalUrl: null });
    const foreign = await read(shared.collectionId, shared.a, shared.bIds[0] ?? '').expect(200);
    expect(guestContentDetailSchema.parse(foreign.body)).toMatchObject({
      isOwn: false,
      frameNo: null,
      text: 'B1',
    });
    expect(JSON.stringify(foreign.body)).not.toContain('Богдан');
  });

  describe('Review Focus 1 (guest)', () => {
    test('without the shared gallery, a foreign item id → 404', async () => {
      const { collectionId, a, bIds } = await twoGuests(CONTRIBUTE_ONLY);
      const res = await read(collectionId, a, bIds[0] ?? '').expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(JSON.stringify(res.body)).not.toContain('B1');
    });

    test("collection Y's guest with Y's cookie on X's paths → 401; X's ids on Y's path → 404", async () => {
      const x = await twoGuests(SHARED_GALLERY);
      const y = await seedCollection(prisma, tokens, { permissions: SHARED_GALLERY });
      const yCookie = await joinAsGuest(server(), y.collectionId, y.link.token);
      for (const res of [
        await list(x.collectionId, yCookie, 'scope=all'),
        await read(x.collectionId, yCookie, x.aIds[0] ?? ''),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
      }
      // Y's guest asks for X's item on Y's own path: out of scope, not found.
      await read(y.collectionId, yCookie, x.aIds[0] ?? '').expect(404);
      const yAll = guestContentPageSchema.parse(
        (await list(y.collectionId, yCookie, 'scope=all').expect(200)).body,
      );
      expect(yAll.items).toEqual([]);
    });

    test('a narrower link applies at once: re-bound to a contribution-only link, scope=all → 403', async () => {
      const { collectionId, a } = await twoGuests(SHARED_GALLERY);
      const narrow = await addLink(prisma, tokens, collectionId, CONTRIBUTE_ONLY);
      await request(server())
        .post(`/api/v1/guest/collections/${collectionId}/session`)
        .set('Origin', ORIGIN)
        .set('Cookie', a)
        .send({ linkToken: narrow.token })
        .expect(200);
      await list(collectionId, a, 'scope=all').expect(403);
      await list(collectionId, a, 'scope=own').expect(200);
    });
  });

  test('validation: scope is required, cursor and limit are checked', async () => {
    const { collectionId, a } = await twoGuests(SHARED_GALLERY);
    for (const query of ['', 'scope=mine', 'scope=own&limit=0', 'scope=own&cursor=nope']) {
      const res = await list(collectionId, a, query).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    await read(collectionId, a, 'not-a-uuid').expect(400);
  });
});
