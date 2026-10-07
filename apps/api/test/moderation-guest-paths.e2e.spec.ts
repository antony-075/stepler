import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  guestContentDetailSchema,
  guestContentItemSchema,
  guestContentPageSchema,
  guestContextSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { fixture, uploadCalls, uploadFile } from './support/uploads.js';

// Slice 9 plan, Task 3 (Review Focus 1 and 2): a hidden frame is gone from every guest path, and
// a blocked collection (or a blocked owner) closes every guest route.

const prisma = createTestPrisma();

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('hidden frames and blocked collections on guest paths', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ UPLOAD_PART_SIZE_BYTES: '5242880' }));
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

  /** A shared-gallery collection with guest A's photo and text, and guest B. */
  async function scene() {
    const admin = await signInAs(app, prisma, `owner-${randomUUID()}@example.com`);
    const seeded = await seedCollection(prisma, tokens, {
      ownerId: admin.userId,
      permissions: SHARED_GALLERY,
    });
    const a = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const b = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const uploads = uploadCalls(server(), seeded.collectionId, a);
    const upload = await uploadFile(uploads, 'IMG_0001.jpg', fixture('photo.jpg'));
    const photo = guestContentItemSchema.parse(
      (await uploads.complete(upload.uploadId).expect(200)).body,
    );
    const textKey = randomUUID();
    const text = guestContentItemSchema.parse(
      (
        await request(server())
          .post(`/api/v1/guest/collections/${seeded.collectionId}/texts`)
          .set('Origin', ORIGIN)
          .set('Cookie', a)
          .set('Idempotency-Key', textKey)
          .send({ body: 'Вітаємо!' })
          .expect(201)
      ).body,
    );
    return { ...seeded, admin, a, b, uploads, uploadId: upload.uploadId, photo, text, textKey };
  }

  type Scene = Awaited<ReturnType<typeof scene>>;

  const guestBase = (s: Scene) => `/api/v1/guest/collections/${s.collectionId}`;
  const list = (s: Scene, cookie: string, scope: 'own' | 'all') =>
    request(server())
      .get(`${guestBase(s)}/content?scope=${scope}`)
      .set('Cookie', cookie);
  const read = (s: Scene, cookie: string, id: string) =>
    request(server())
      .get(`${guestBase(s)}/content/${id}`)
      .set('Cookie', cookie);
  const context = (s: Scene, cookie: string) =>
    request(server())
      .get(`${guestBase(s)}/context`)
      .set('Cookie', cookie);
  const listedIds = async (s: Scene, cookie: string, scope: 'own' | 'all') =>
    guestContentPageSchema
      .parse((await list(s, cookie, scope).expect(200)).body)
      .items.map((item) => item.id);
  const total = async (s: Scene, cookie: string) =>
    guestContextSchema.parse((await context(s, cookie).expect(200)).body).counts?.total;
  const fromFrame = (s: Scene, path: string, contentItemId: string) =>
    request(server())
      .post(`/api/v1/collections/${s.collectionId}/${path}/from-frame`)
      .set('Cookie', s.admin.cookie)
      .set('Origin', ORIGIN)
      .send({ contentItemId });

  const hide = (id: string, by: 'ADMIN' | 'OPERATOR', userId: string) =>
    prisma.$executeRawUnsafe(
      `UPDATE "ContentItem" SET "hiddenAt" = now(), "hiddenBy" = $2::"HiddenBy",
         "hiddenByUserId" = $3::uuid, "hiddenReason" = $4 WHERE "id" = $1::uuid`,
      id,
      by,
      userId,
      by === 'OPERATOR' ? 'Порушення приватності' : null,
    );
  const unhide = (id: string) =>
    prisma.$executeRawUnsafe(
      `UPDATE "ContentItem" SET "hiddenAt" = NULL, "hiddenBy" = NULL, "hiddenByUserId" = NULL,
         "hiddenReason" = NULL WHERE "id" = $1::uuid`,
      id,
    );

  test.each(['ADMIN', 'OPERATOR'] as const)(
    'a frame hidden by the %s is gone for guests everywhere, and back once shown',
    async (by) => {
      const s = await scene();
      expect(await total(s, s.b)).toBe(2);

      await hide(s.photo.id, by, s.admin.userId);
      await hide(s.text.id, by, s.admin.userId);

      // Lists, the contributor's own frames included, and the detail with its download links.
      expect(await listedIds(s, s.a, 'all')).toEqual([]);
      expect(await listedIds(s, s.a, 'own')).toEqual([]);
      expect(await listedIds(s, s.b, 'all')).toEqual([]);
      await read(s, s.a, s.photo.id).expect(404);
      await read(s, s.b, s.photo.id).expect(404);
      // The counts.
      expect(await total(s, s.b)).toBe(0);
      // A text replay with the original key, and an upload completion replay.
      const replay = await request(server())
        .post(`${guestBase(s)}/texts`)
        .set('Origin', ORIGIN)
        .set('Cookie', s.a)
        .set('Idempotency-Key', s.textKey)
        .send({ body: 'Вітаємо!' })
        .expect(404);
      expect(replay.body).toMatchObject({ code: 'CONTENT_NOT_FOUND' });
      const completion = await s.uploads.complete(s.uploadId).expect(404);
      expect(completion.body).toMatchObject({ code: 'CONTENT_NOT_FOUND' });
      // The contributor's own delete: invisible means non-existent, and nothing is deleted.
      await request(server())
        .delete(`${guestBase(s)}/content/${s.photo.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', s.a)
        .expect(404);
      const row = await prisma.contentItem.findUniqueOrThrow({ where: { id: s.photo.id } });
      expect(row.deletedAt).toBeNull();
      // The admin cannot make a hidden frame the guest page's cover or the collection image.
      for (const path of ['guest-page/draft/cover', 'guest-page/draft/background', 'image']) {
        const res = await fromFrame(s, path, s.photo.id).expect(422);
        expect(res.body).toMatchObject({ code: 'COVER_SOURCE_INVALID' });
      }

      await unhide(s.photo.id);
      await unhide(s.text.id);
      expect(await listedIds(s, s.a, 'all')).toEqual([s.text.id, s.photo.id]);
      expect(await listedIds(s, s.a, 'own')).toEqual([s.text.id, s.photo.id]);
      guestContentDetailSchema.parse((await read(s, s.b, s.photo.id).expect(200)).body);
      expect(await total(s, s.b)).toBe(2);
      await s.uploads.complete(s.uploadId).expect(200);
    },
  );

  test('a hide during reads: each answer is whole or 404, and every later one is 404', async () => {
    const s = await scene();
    const readOne = async () => {
      const res = await read(s, s.b, s.photo.id);
      if (res.status === 200) guestContentDetailSchema.parse(res.body);
      return res.status;
    };
    const before = Array.from({ length: 10 }, readOne);
    const hiding = hide(s.photo.id, 'OPERATOR', s.admin.userId);
    const during = Array.from({ length: 10 }, readOne);
    const statuses = await Promise.all([...before, ...during]);
    await hiding;
    expect(statuses.every((status) => status === 200 || status === 404)).toBe(true);
    const after = await Promise.all(Array.from({ length: 10 }, readOne));
    expect(after.every((status) => status === 404)).toBe(true);
  });

  /** Every route the app serves under `/api/v1/guest/`, from the Express router. */
  function guestRoutes(): { method: string; path: string }[] {
    const instance = app.getHttpAdapter().getInstance() as {
      router?: { stack: RouteLayer[] };
      _router?: { stack: RouteLayer[] };
    };
    const stack = instance.router?.stack ?? instance._router?.stack ?? [];
    return stack.flatMap((layer) =>
      layer.route !== undefined && layer.route.path.startsWith('/api/v1/guest/')
        ? Object.keys(layer.route.methods).map((method) => ({
            method,
            path: layer.route?.path ?? '',
          }))
        : [],
    );
  }

  /** Calls every guest route with a valid cookie and plausible ids and bodies. */
  async function callEveryGuestRoute(s: Scene, cancelUploadId: string) {
    const routes = guestRoutes();
    // The enumeration must see the routes this slice knows about, so it is not vacuous.
    expect(routes.length).toBeGreaterThanOrEqual(12);
    const results: { route: string; status: number; code: unknown }[] = [];
    for (const { method, path } of routes) {
      const isCancel = method === 'delete' && path.endsWith('/uploads/:uploadId');
      const url = path
        .replace(':collectionId', s.collectionId)
        .replace(':uploadId', isCancel ? cancelUploadId : s.uploadId)
        .replace(':id', s.photo.id);
      const body =
        path.endsWith('/links/resolve') || path.endsWith('/links/theme')
          ? { linkToken: s.link.token }
          : path.endsWith('/session') && method === 'post'
            ? { linkToken: s.link.token }
            : path.endsWith('/session')
              ? { name: 'Ірина' }
              : path.endsWith('/texts')
                ? { body: 'Ще' }
                : path.endsWith('/uploads')
                  ? {
                      clientUploadId: randomUUID(),
                      filename: 'IMG_0002.jpg',
                      mimeType: 'image/jpeg',
                      sizeBytes: 1000,
                    }
                  : path.endsWith('/parts')
                    ? { partNumbers: [1] }
                    : {};
      const call = request(server())
        [method as 'get' | 'post' | 'patch' | 'delete' | 'put'](url)
        .set('Origin', ORIGIN)
        // Guest A owns the uploads the paths name.
        .set('Cookie', s.a)
        .set('Idempotency-Key', randomUUID());
      const res = method === 'get' || method === 'delete' ? await call : await call.send(body);
      results.push({
        route: `${method.toUpperCase()} ${path}`,
        status: res.status,
        code: (res.body as { code?: unknown }).code,
      });
    }
    return results;
  }

  const expectClosed = (results: { route: string; status: number; code: unknown }[]) => {
    for (const result of results) {
      if (result.route.endsWith('/links/theme')) {
        // The theme never says why; a collection that is gone for guests is unknown.
        expect(result, result.route).toMatchObject({ status: 404 });
      } else if (result.route.startsWith('DELETE') && result.route.endsWith('/:uploadId')) {
        // Cancelling only frees space, so it stays allowed once the link closes.
        expect(result, result.route).toMatchObject({ status: 204 });
      } else {
        expect(result, result.route).toMatchObject({
          status: 410,
          code: 'COLLECTION_UNAVAILABLE',
        });
      }
    }
  };

  test('a blocked collection closes every guest route; unblocking opens them again', async () => {
    const s = await scene();
    const pending = await s.uploads
      .initiate({ filename: 'IMG_0003.jpg', sizeBytes: 1000, mimeType: 'image/jpeg' })
      .expect(201);
    const pendingId = (pending.body as { uploadId: string }).uploadId;
    const toCancel = await s.uploads
      .initiate({ filename: 'IMG_0004.jpg', sizeBytes: 1000, mimeType: 'image/jpeg' })
      .expect(201);
    const toCancelId = (toCancel.body as { uploadId: string }).uploadId;

    await prisma.collection.update({
      where: { id: s.collectionId },
      data: { blockedAt: new Date(), blockedReason: 'Порушення умов' },
    });
    expectClosed(await callEveryGuestRoute(s, toCancelId));

    // An upload initiated before the block: the completion is refused and recorded.
    const completion = await s.uploads.complete(pendingId).expect(410);
    expect(completion.body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    expect(
      await prisma.uploadSession.findUniqueOrThrow({ where: { id: pendingId } }),
    ).toMatchObject({ status: 'REJECTED', rejectReason: 'COLLECTION_UNAVAILABLE' });

    await prisma.collection.update({
      where: { id: s.collectionId },
      data: { blockedAt: null, blockedReason: null },
    });
    await context(s, s.b).expect(200);
    await request(server())
      .post('/api/v1/guest/links/theme')
      .set('Origin', ORIGIN)
      .send({ linkToken: s.link.token })
      .expect(200);
  });

  test('a blocked owner closes every guest route too', async () => {
    const s = await scene();
    const toCancel = await s.uploads
      .initiate({ filename: 'IMG_0004.jpg', sizeBytes: 1000, mimeType: 'image/jpeg' })
      .expect(201);
    await prisma.user.update({
      where: { id: s.ownerId },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
    expectClosed(await callEveryGuestRoute(s, (toCancel.body as { uploadId: string }).uploadId));
  });
});
