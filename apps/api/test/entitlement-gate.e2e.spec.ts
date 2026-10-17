import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { guestContextSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { GATE_ALLOW_LIST, GATE_ALLOW_PREFIXES } from '../src/billing/entitlement-gate.js';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { endAllAccess, givePack, grantTestPlan } from './support/billing.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, SHARED_GALLERY, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { fixture, putTo, uploadCalls, asSession, partUrls } from './support/uploads.js';

// Read-only and collecting-closed on every write path (ADR 0018 [P2], [P3]; plan Task 4,
// Review Focus 2).

const DAY_MS = 24 * 3600_000;
const prisma = createTestPrisma();

let app: INestApplication;
let server: Server;
let tokens: GuestLinkTokens;

beforeAll(async () => {
  app = await createApp(testEnv({ UPLOAD_PART_SIZE_BYTES: '5242880' }));
  await listenOnLoopback(app);
  server = app.getHttpServer() as Server;
  tokens = app.get(GuestLinkTokens);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

interface Scene {
  cookie: string;
  userId: string;
  collectionId: string;
  /** A second, archived collection of the same owner (for unarchive). */
  archivedId: string;
  linkId: string;
  /** An additional link, paused (for activate). */
  pausedLinkId: string;
  guestCookie: string;
  textId: string;
  pageRevision: number;
  page: { templateId: string; settings: unknown; welcomeMessage: string | null };
}

const admin = (s: Scene, method: 'post' | 'patch' | 'put' | 'delete', path: string) =>
  request(server)[method](path).set('Origin', ORIGIN).set('Cookie', s.cookie);
const guest = (s: Scene, method: 'post' | 'get', path: string) =>
  request(server)[method](path).set('Origin', ORIGIN).set('Cookie', s.guestCookie);

const photoUpload = () => ({
  clientUploadId: randomUUID(),
  filename: 'IMG_0001.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
});

/** An owner with a collection (shared gallery link), a guest who added a text, and spare rows. */
async function scene(): Promise<Scene> {
  const { cookie, userId } = await signInAs(app, prisma, 'olena@example.com');
  const seeded = await seedCollection(prisma, tokens, {
    ownerId: userId,
    permissions: SHARED_GALLERY,
  });
  const collectionId = seeded.collectionId;
  const archived = await admin({ cookie } as Scene, 'post', '/api/v1/collections')
    .send({ title: 'Архів' })
    .expect(201);
  const archivedId = (archived.body as { id: string }).id;
  await admin({ cookie } as Scene, 'post', `/api/v1/collections/${archivedId}/archive`).expect(200);
  const extra = await admin(
    { cookie } as Scene,
    'post',
    `/api/v1/collections/${collectionId}/guest-links`,
  )
    .send({ label: 'Друзі', permissions: SHARED_GALLERY })
    .expect(201);
  const pausedLinkId = (extra.body as { id: string }).id;
  await admin({ cookie } as Scene, 'post', `/api/v1/guest-links/${pausedLinkId}/deactivate`).expect(
    200,
  );
  const guestCookie = await joinAsGuest(server, collectionId, seeded.link.token);
  const text = await request(server)
    .post(`/api/v1/guest/collections/${collectionId}/texts`)
    .set('Origin', ORIGIN)
    .set('Cookie', guestCookie)
    .set('Idempotency-Key', randomUUID())
    .send({ body: 'Вітаємо!' })
    .expect(201);
  const page = await request(server)
    .get(`/api/v1/collections/${collectionId}/guest-page`)
    .set('Cookie', cookie)
    .expect(200);
  const published = (page.body as { published: Scene['page'] & { revision?: number } }).published;
  return {
    cookie,
    userId,
    collectionId,
    archivedId,
    linkId: seeded.link.id,
    pausedLinkId,
    guestCookie,
    textId: (text.body as { id: string }).id,
    // Any revision: the gate answers before the revision is compared.
    pageRevision: published.revision ?? 1,
    page: {
      templateId: published.templateId,
      settings: published.settings,
      welcomeMessage: published.welcomeMessage,
    },
  };
}

type Case = (s: Scene) => request.Test;

/** Every gated admin route, called with a body that would otherwise succeed or get past validation. */
const ADMIN_CASES: Record<string, Case> = {
  'POST /api/v1/collections': (s) =>
    admin(s, 'post', '/api/v1/collections').send({ title: 'Нова' }),
  'PATCH /api/v1/collections/:id': (s) =>
    admin(s, 'patch', `/api/v1/collections/${s.collectionId}`).send({ title: 'Нова назва' }),
  'POST /api/v1/collections/:id/unarchive': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.archivedId}/unarchive`),
  'POST /api/v1/collections/:id/guest-links': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/guest-links`).send({
      label: 'Ще',
      permissions: SHARED_GALLERY,
    }),
  'PATCH /api/v1/guest-links/:id': (s) =>
    admin(s, 'patch', `/api/v1/guest-links/${s.pausedLinkId}`).send({ label: 'Нова мітка' }),
  'POST /api/v1/guest-links/:id/activate': (s) =>
    admin(s, 'post', `/api/v1/guest-links/${s.pausedLinkId}/activate`),
  'PUT /api/v1/collections/:id/guest-page/draft': (s) =>
    admin(s, 'put', `/api/v1/collections/${s.collectionId}/guest-page/draft`).send({
      baseRevision: null,
      ...s.page,
    }),
  'POST /api/v1/collections/:id/guest-page/publish': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/guest-page/publish`).send({
      revision: s.pageRevision,
    }),
  'POST /api/v1/collections/:id/guest-page/draft/:slot/from-frame': (s) =>
    admin(
      s,
      'post',
      `/api/v1/collections/${s.collectionId}/guest-page/draft/cover/from-frame`,
    ).send({
      contentItemId: s.textId,
    }),
  'POST /api/v1/collections/:id/guest-page/draft/:slot/restore': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/guest-page/draft/cover/restore`).send({
      imageId: randomUUID(),
    }),
  'POST /api/v1/collections/:id/guest-page/draft/:slot/uploads': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/guest-page/draft/cover/uploads`).send(
      photoUpload(),
    ),
  'POST /api/v1/collections/:id/image/from-frame': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/image/from-frame`).send({
      contentItemId: s.textId,
    }),
  'POST /api/v1/collections/:id/image/uploads': (s) =>
    admin(s, 'post', `/api/v1/collections/${s.collectionId}/image/uploads`).send(photoUpload()),
};

const GUEST_CASES: Record<string, Case> = {
  'POST /api/v1/guest/collections/:collectionId/uploads': (s) =>
    guest(s, 'post', `/api/v1/guest/collections/${s.collectionId}/uploads`).send(photoUpload()),
  'POST /api/v1/guest/collections/:collectionId/texts': (s) =>
    guest(s, 'post', `/api/v1/guest/collections/${s.collectionId}/texts`)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'Ще одне' }),
};

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Every non-GET route the app serves, from the Express router. */
function mutatingRoutes(): string[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: RouteLayer[] };
    _router?: { stack: RouteLayer[] };
  };
  const stack = instance.router?.stack ?? instance._router?.stack ?? [];
  return stack.flatMap((layer) =>
    layer.route === undefined
      ? []
      : Object.keys(layer.route.methods)
          .filter((method) => !['get', 'head', 'options'].includes(method))
          // The catch-all 404 handler is no route.
          .filter(() => !layer.route?.path.includes('*splat'))
          .map((method) => `${method.toUpperCase()} ${layer.route?.path ?? ''}`),
  );
}

const auditCount = () => prisma.auditEvent.count();

describe('the gate covers every write route', () => {
  test('each mutating route is gated or deliberately allowed', () => {
    const routes = mutatingRoutes();
    // Not vacuous: the enumeration sees the app's routes.
    expect(routes.length).toBeGreaterThanOrEqual(50);
    const gated = new Set([...Object.keys(ADMIN_CASES), ...Object.keys(GUEST_CASES)]);
    const unaccounted = routes.filter(
      (route) =>
        !gated.has(route) &&
        !GATE_ALLOW_LIST.includes(route) &&
        !GATE_ALLOW_PREFIXES.some((prefix) => route.split(' ')[1]?.startsWith(prefix)),
    );
    expect(unaccounted).toEqual([]);
    // And every listed route exists, so the lists cannot rot.
    for (const route of [...gated, ...GATE_ALLOW_LIST]) expect(routes, route).toContain(route);
  });
});

describe('the trial ended (no plan)', () => {
  test('every gated admin route → 403 ACCOUNT_READ_ONLY, nothing written', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.userId);
    const before = { audit: await auditCount(), links: await prisma.guestLink.count() };
    for (const [route, call] of Object.entries(ADMIN_CASES)) {
      const res = await call(s);
      expect({ route, status: res.status, code: (res.body as { code?: string }).code }).toEqual({
        route,
        status: 403,
        code: 'ACCOUNT_READ_ONLY',
      });
    }
    expect(await auditCount()).toBe(before.audit);
    expect(await prisma.guestLink.count()).toBe(before.links);
    expect(await prisma.collection.count()).toBe(2);
    expect(await prisma.uploadSession.count()).toBe(0);
    expect(await prisma.guestPageVersion.count({ where: { state: 'DRAFT' } })).toBe(0);
  });

  test('guests cannot add, still view; the context says READ_ONLY', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.userId);
    for (const [route, call] of Object.entries(GUEST_CASES)) {
      const res = await call(s);
      expect({ route, status: res.status, code: (res.body as { code?: string }).code }).toEqual({
        route,
        status: 403,
        code: 'COLLECTION_READ_ONLY',
      });
    }
    await guest(s, 'get', `/api/v1/guest/collections/${s.collectionId}/content?scope=all`).expect(
      200,
    );
    const context = await guest(s, 'get', `/api/v1/guest/collections/${s.collectionId}/context`);
    expect(guestContextSchema.parse(context.body).contribution).toBe('READ_ONLY');
    expect(await prisma.contentItem.count()).toBe(1);
  });

  test('archive, delete content and revoke still work', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.userId);
    await admin(s, 'post', `/api/v1/guest-links/${s.pausedLinkId}/revoke`).expect(200);
    await admin(s, 'delete', `/api/v1/content/${s.textId}`).expect(204);
    await admin(s, 'post', `/api/v1/collections/${s.collectionId}/archive`).expect(200);
  });

  test('a stranger still gets 404, never the state', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.userId);
    const other = await signInAs(app, prisma, 'iryna@example.com');
    await request(server)
      .patch(`/api/v1/collections/${s.collectionId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', other.cookie)
      .send({ title: 'Чуже' })
      .expect(404);
  });

  test('an upload initiated before the end still completes', async () => {
    const s = await scene();
    const calls = uploadCalls(server, s.collectionId, s.guestCookie);
    const bytes = fixture('photo.jpg');
    const res = await calls
      .initiate({ filename: 'IMG_0002.jpg', sizeBytes: bytes.length })
      .expect(201);
    const session = asSession(res.body);
    const urls = await partUrls(calls, session.uploadId, [1]);
    await endAllAccess(prisma, s.userId);
    expect(await putTo(urls.get(1) ?? '', bytes)).toBe(200);
    await calls.complete(session.uploadId).expect(200);
    expect(await prisma.contentItem.count({ where: { kind: 'PHOTO' } })).toBe(1);
  });
});

describe('a pack collection', () => {
  test('after its window: guests are closed out, the admin still edits and shares', async () => {
    const s = await scene();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(Date.now() - DAY_MS),
      retentionEndsAt: new Date(Date.now() + 300 * DAY_MS),
    });
    await endAllAccess(prisma, s.userId);
    for (const call of Object.values(GUEST_CASES)) {
      const res = await call(s);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'COLLECTING_CLOSED' });
    }
    const context = await guest(s, 'get', `/api/v1/guest/collections/${s.collectionId}/context`);
    expect(guestContextSchema.parse(context.body).contribution).toBe('COLLECTING_CLOSED');
    await ADMIN_CASES['PATCH /api/v1/collections/:id']?.(s).expect(200);
    await ADMIN_CASES['POST /api/v1/collections/:id/guest-links']?.(s).expect(201);
  });

  test('after its retention: read-only, while the owner’s plan collections are not', async () => {
    const s = await scene();
    await givePack(prisma, s.collectionId, {
      windowEndsAt: new Date(Date.now() - 300 * DAY_MS),
      retentionEndsAt: new Date(Date.now() - DAY_MS),
    });
    const patch = await ADMIN_CASES['PATCH /api/v1/collections/:id']?.(s);
    expect(patch?.status).toBe(403);
    expect(patch?.body).toMatchObject({ code: 'COLLECTION_READ_ONLY' });
    const text = await GUEST_CASES['POST /api/v1/guest/collections/:collectionId/texts']?.(s);
    expect(text?.body).toMatchObject({ code: 'COLLECTION_READ_ONLY' });
    // The account (test plan) is active: its other collection is unaffected.
    await admin(s, 'post', `/api/v1/collections/${s.archivedId}/unarchive`).expect(200);
    await admin(s, 'patch', `/api/v1/collections/${s.archivedId}`)
      .send({ title: 'Так' })
      .expect(200);
  });
});

describe('grace', () => {
  test('a failed renewal in grace allows everything', async () => {
    const s = await scene();
    const offer = await prisma.billingOffer.findUniqueOrThrow({ where: { code: 'sub-pro' } });
    const price = await prisma.billingPrice.create({
      data: { offerId: offer.id, interval: 'MONTH', currency: 'UAH', amountMinor: 49900 },
    });
    await endAllAccess(prisma, s.userId);
    await prisma.subscription.create({
      data: {
        userId: s.userId,
        source: 'LIQPAY',
        status: 'PAST_DUE',
        offerId: offer.id,
        priceId: price.id,
        interval: 'MONTH',
        amountMinor: 49900,
        currency: 'UAH',
        activeCollections: 5,
        storageBytes: 1n << 40n,
        collectionStorageBytes: 1n << 40n,
        guestLinks: 20,
        currentPeriodStart: new Date(Date.now() - 31 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() - DAY_MS),
        graceEndsAt: new Date(Date.now() + 3 * DAY_MS),
        autoRenewConsentAt: new Date(Date.now() - 31 * DAY_MS),
      },
    });
    await ADMIN_CASES['POST /api/v1/collections']?.(s).expect(201);
    await ADMIN_CASES['PATCH /api/v1/collections/:id']?.(s).expect(200);
    await GUEST_CASES['POST /api/v1/guest/collections/:collectionId/texts']?.(s).expect(201);
  });

  test('a new plan lifts read-only at once', async () => {
    const s = await scene();
    await endAllAccess(prisma, s.userId);
    await ADMIN_CASES['PATCH /api/v1/collections/:id']?.(s).expect(403);
    await grantTestPlan(prisma, s.userId);
    await ADMIN_CASES['PATCH /api/v1/collections/:id']?.(s).expect(200);
  });
});
