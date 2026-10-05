import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  guestContentItemSchema,
  guestContextSchema,
  guestPageEditorSchema,
  type GuestPageEditor,
  problemDetailsSchema,
  type ThemeSettings,
} from '@stepler/contracts';
import { definitionOf } from '@stepler/templates/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { ApiEnv } from '../src/config/env.js';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { PurgeContentHandler } from '../src/worker/handlers/purge-content.handler.js';
import { loadWorkerEnv } from '../src/worker/worker-env.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys } from './support/storage.js';
import {
  bigBuffer,
  draftImageUploadCalls,
  fixture,
  uploadCalls,
  uploadFile,
} from './support/uploads.js';

// The guest page editor API (plan Task 9): draft isolation, publish and reset with image garbage
// collection (Review Focus 1), optimistic concurrency (Review Focus 2), crafted settings (Review
// Focus 3), authorization and quota.

const MB = 1_000_000;
const UPLOAD_ENV = { UPLOAD_PART_SIZE_BYTES: '5242880' };
const env = testEnv(UPLOAD_ENV);
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const workerEnv = loadWorkerEnv({
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  S3_ENDPOINT: env.S3_ENDPOINT,
  S3_REGION: env.S3_REGION,
  S3_BUCKET: env.S3_BUCKET,
  S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: 'true',
});
const classic = definitionOf('classic')!;

async function startApp(apiEnv: ApiEnv) {
  const app = await createApp(apiEnv);
  await listenOnLoopback(app);
  return { app, server: app.getHttpServer() as Server, tokens: app.get(GuestLinkTokens) };
}
type Started = Awaited<ReturnType<typeof startApp>>;
let s: Started;

/** A signed-in owner, their collection, a guest in it, and the editor routes as the owner. */
async function owner(started: Started = s) {
  const admin = await signInAs(started.app, prisma, `owner-${randomUUID()}@example.com`);
  const seeded = await seedCollection(prisma, started.tokens, { ownerId: admin.userId });
  const guestCookie = await joinAsGuest(started.server, seeded.collectionId, seeded.link.token);
  const root = `/api/v1/collections/${seeded.collectionId}/guest-page`;
  const as = (cookie: string) => ({
    get: () => request(started.server).get(root).set('Cookie', cookie),
    save: (body: Record<string, unknown>) =>
      request(started.server)
        .put(`${root}/draft`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send(body),
    reset: () =>
      request(started.server).delete(`${root}/draft`).set('Cookie', cookie).set('Origin', ORIGIN),
    publish: (revision: number) =>
      request(started.server)
        .post(`${root}/publish`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ revision }),
    fromFrame: (slot: 'cover' | 'background', contentItemId: string) =>
      request(started.server)
        .post(`${root}/draft/${slot}/from-frame`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ contentItemId }),
    removeImage: (slot: 'cover' | 'background') =>
      request(started.server)
        .delete(`${root}/draft/${slot}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN),
    uploads: (slot: 'cover' | 'background') =>
      draftImageUploadCalls(started.server, seeded.collectionId, cookie, slot),
  });
  const own = as(admin.cookie);
  return {
    ...admin,
    ...seeded,
    guestCookie,
    guest: uploadCalls(started.server, seeded.collectionId, guestCookie),
    ...own,
    as,
    /** A frame as the published cover: into the draft, then published (what «Зберегти» does). */
    publishedCover: async (contentItemId: string) => {
      const res = await own.fromFrame('cover', contentItemId).expect(200);
      await own.publish(editor(res.body).draft?.revision ?? 0).expect(200);
    },
    context: () =>
      request(started.server)
        .get(`/api/v1/guest/collections/${seeded.collectionId}/context`)
        .set('Cookie', guestCookie),
  };
}
type Owner = Awaited<ReturnType<typeof owner>>;

/** A guest photo frame, completed (PENDING until the worker runs). */
async function frame(o: Owner, name = 'IMG_0001.jpg', bytes: Buffer = fixture('photo.jpg')) {
  const session = await uploadFile(o.guest, name, bytes);
  return guestContentItemSchema.parse((await o.guest.complete(session.uploadId).expect(200)).body);
}

const editor = (body: unknown): GuestPageEditor => guestPageEditorSchema.parse(body);
const settings = (patch: Partial<ThemeSettings> = {}): ThemeSettings => ({
  ...classic.defaults,
  ...patch,
});
const draftBody = (baseRevision: number | null, patch: Partial<ThemeSettings> = {}) => ({
  baseRevision,
  templateId: 'classic',
  settings: settings(patch),
  welcomeMessage: null,
});
const images = (collectionId: string) =>
  prisma.collectionImage.findMany({ where: { collectionId }, orderBy: { createdAt: 'asc' } });
const purges = async () =>
  (await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data);

/** Every key of `value`, at any depth (for "no draft anywhere in a guest response"). */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}

describe('guest page editor API', () => {
  beforeAll(async () => {
    s = await startApp(env);
  });

  afterAll(async () => {
    await s.app.close();
    storage.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('GET: the published classic page, no draft', async () => {
    const o = await owner();
    const body = editor((await o.get().expect(200)).body);
    expect(body.draft).toBeNull();
    expect(body.published).toMatchObject({
      templateId: 'classic',
      templateVersion: 1,
      settings: classic.defaults,
      welcomeMessage: null,
      cover: null,
      background: null,
    });
  });

  test('M6: GET never writes; a collection without a published row reads as the defaults', async () => {
    const o = await owner();
    await prisma.guestPageVersion.deleteMany({ where: { collectionId: o.collectionId } });
    const body = editor((await o.get().expect(200)).body);
    expect(body).toMatchObject({
      draft: null,
      published: { templateId: 'classic', settings: classic.defaults },
    });
    expect(await prisma.guestPageVersion.count({ where: { collectionId: o.collectionId } })).toBe(
      0,
    );
  });

  test('draft isolation: a saved draft and its background never reach guests', async () => {
    const o = await owner();
    const saved = editor((await o.save(draftBody(null, { accent: '#5A4A8C' })).expect(200)).body);
    expect(saved.draft).toMatchObject({ revision: 2, settings: { accent: '#5A4A8C' } });
    expect(saved.published.settings.accent).toBe('#B83E26');
    const photo = await frame(o);
    const withBackground = editor((await o.fromFrame('background', photo.id).expect(200)).body);
    expect(withBackground.draft?.background).toMatchObject({ status: 'PENDING' });
    // The image change did not bump the revision.
    expect(withBackground.draft?.revision).toBe(2);

    const res = await o.context().expect(200);
    const context = guestContextSchema.parse(res.body);
    expect(context.page).toMatchObject({ background: null, settings: { accent: '#B83E26' } });
    expect(keysOf(res.body)).not.toContain('draft');
    expect(keysOf(res.body)).not.toContain('revision');
    expect(res.text).not.toContain('/background/');
  });

  test('publish: guests see it; a second publish and a reset after it are no-ops', async () => {
    const o = await owner();
    await o.save(draftBody(null, { accent: '#5A4A8C', align: 'center' })).expect(200);
    const published = editor((await o.publish(2).expect(200)).body);
    expect(published.draft).toBeNull();
    expect(published.published.settings).toMatchObject({ accent: '#5A4A8C', align: 'center' });
    const context = guestContextSchema.parse((await o.context().expect(200)).body);
    expect(context.page.settings).toMatchObject({ accent: '#5A4A8C', align: 'center' });
    expect(editor((await o.publish(2).expect(200)).body)).toEqual(published);
    await o.reset().expect(204);
    expect(editor((await o.get().expect(200)).body).published.settings.accent).toBe('#5A4A8C');
  });

  describe('Review Focus 1: images and garbage collection', () => {
    test('published cover A, draft cover B, reset: B goes and is purged, A stays', async () => {
      const o = await owner();
      await o.publishedCover((await frame(o, 'a.jpg')).id);
      const [a] = await images(o.collectionId);
      const withB = editor(
        (await o.fromFrame('cover', (await frame(o, 'b.jpg')).id).expect(200)).body,
      );
      const b = (await images(o.collectionId)).find((row) => row.id !== a?.id);
      expect(withB.draft?.cover).not.toBeNull();
      // Guests still see the published page (A is PENDING, so no cover yet; never B).
      expect(guestContextSchema.parse((await o.context().expect(200)).body).page.cover).toBeNull();
      await o.reset().expect(204);
      expect((await images(o.collectionId)).map((row) => row.id)).toEqual([a?.id]);
      expect(await purges()).toEqual([
        { collectionId: o.collectionId, imageId: b?.id, slot: 'COVER' },
      ]);
      const after = await prisma.guestPageVersion.findMany({
        where: { collectionId: o.collectionId },
      });
      expect(after.map((v) => [v.state, v.coverImageId])).toEqual([['PUBLISHED', a?.id]]);
    });

    test('published A, draft B, publish: A is purged and B is published', async () => {
      const o = await owner();
      await o.publishedCover((await frame(o, 'a.jpg')).id);
      const [a] = await images(o.collectionId);
      const withB = editor(
        (await o.fromFrame('cover', (await frame(o, 'b.jpg')).id).expect(200)).body,
      );
      const b = (await images(o.collectionId)).find((row) => row.id !== a?.id);
      await o.publish(withB.draft?.revision ?? 0).expect(200);
      expect((await images(o.collectionId)).map((row) => row.id)).toEqual([b?.id]);
      expect(await purges()).toEqual([
        { collectionId: o.collectionId, imageId: a?.id, slot: 'COVER' },
      ]);
      const published = await prisma.guestPageVersion.findUniqueOrThrow({
        where: { collectionId_state: { collectionId: o.collectionId, state: 'PUBLISHED' } },
      });
      expect(published.coverImageId).toBe(b?.id);
    });

    test('a draft that keeps the published cover keeps it through publish and reset', async () => {
      const o = await owner();
      await o.publishedCover((await frame(o, 'a.jpg')).id);
      const [a] = await images(o.collectionId);
      const first = editor((await o.save(draftBody(null, { accent: '#2C7350' })).expect(200)).body);
      await o.reset().expect(204);
      const saved = editor((await o.save(draftBody(null)).expect(200)).body);
      // A revision never repeats: the reset draft's number names nothing now.
      expect(saved.draft?.revision).toBeGreaterThan(first.draft?.revision ?? 0);
      await o.publish(first.draft?.revision ?? 0).expect(409);
      await o.publish(saved.draft?.revision ?? 0).expect(200);
      expect((await images(o.collectionId)).map((row) => row.id)).toEqual([a?.id]);
      expect(await purges()).toEqual([]);
    });

    test('a frame-copied draft cover survives the frame’s deletion and purge', async () => {
      const o = await owner();
      const photo = await frame(o);
      await o.fromFrame('cover', photo.id).expect(200);
      const [cover] = await images(o.collectionId);
      await request(s.server)
        .delete(`/api/v1/content/${photo.id}`)
        .set('Cookie', o.cookie)
        .set('Origin', ORIGIN)
        .expect(204);
      await new PurgeContentHandler(prisma, storage, workerEnv).handle({ contentItemId: photo.id });
      expect((await images(o.collectionId)).map((row) => row.id)).toEqual([cover?.id]);
      expect(
        await allKeys(storage, `collections/${o.collectionId}/cover/${cover?.id}/`),
      ).toHaveLength(1);
    });

    test('removing the draft cover leaves the published one; an upload completes into the draft', async () => {
      const o = await owner();
      await o.publishedCover((await frame(o, 'a.jpg')).id);
      const removed = editor((await o.removeImage('cover').expect(200)).body);
      expect(removed.draft?.cover).toBeNull();
      expect(removed.published.cover).not.toBeNull();
      const calls = o.uploads('background');
      const session = await uploadFile(calls, 'bg.jpg', fixture('photo.jpg'));
      const done = editor((await calls.complete(session.uploadId).expect(200)).body);
      expect(done.draft?.background).toMatchObject({ status: 'PENDING', largeUrl: null });
      expect(done.published.background).toBeNull();
      const background = (await images(o.collectionId)).find((row) => row.slot === 'BACKGROUND');
      expect(
        await allKeys(storage, `collections/${o.collectionId}/background/${background?.id}/`),
      ).toHaveLength(1);
      expect(
        (await queuedJobs(prisma, 'media.collection-image')).map((job) => job.data),
      ).toContainEqual({
        collectionId: o.collectionId,
        imageId: background?.id,
      });
    });

    test('M4: each reference points at an image of its own slot (application-enforced)', async () => {
      const o = await owner();
      await o.fromFrame('cover', (await frame(o, 'a.jpg')).id).expect(200);
      await o.fromFrame('background', (await frame(o, 'b.jpg')).id).expect(200);
      const draft = await prisma.guestPageVersion.findUniqueOrThrow({
        where: { collectionId_state: { collectionId: o.collectionId, state: 'DRAFT' } },
        include: { coverImage: true, backgroundImage: true },
      });
      expect([draft.coverImage?.slot, draft.backgroundImage?.slot]).toEqual([
        'COVER',
        'BACKGROUND',
      ]);
    });

    test('a READY background shows largeUrl to the owner', async () => {
      const o = await owner();
      await o.fromFrame('background', (await frame(o)).id).expect(200);
      const [row] = await images(o.collectionId);
      await prisma.collectionImage.update({
        where: { id: row?.id ?? '' },
        data: { status: 'READY', width: 3000, height: 2000, derivedSizeBytes: 10n },
      });
      const body = editor((await o.get().expect(200)).body);
      expect(body.draft?.background?.largeUrl).toMatch(/\/background\/.+\/large\.webp/);
    });
  });

  describe('Review Focus 2: two tabs, one draft', () => {
    test('revisions: null → 2; null again → 409; a stale revision → 409; the current one → 3', async () => {
      const o = await owner();
      expect(editor((await o.save(draftBody(null)).expect(200)).body).draft?.revision).toBe(2);
      expect((await o.save(draftBody(null)).expect(409)).body).toMatchObject({
        code: 'GUEST_PAGE_DRAFT_CONFLICT',
      });
      await o.save(draftBody(1)).expect(409);
      expect(editor((await o.save(draftBody(2)).expect(200)).body).draft?.revision).toBe(3);
      // A publish with a stale revision conflicts too; a reset makes any revision stale.
      await o.publish(2).expect(409);
      await o.reset().expect(204);
      await o.save(draftBody(3)).expect(409);
    });

    test('a draft image completing between two saves does not change the revision', async () => {
      const o = await owner();
      await o.save(draftBody(null)).expect(200);
      const calls = o.uploads('cover');
      const session = await uploadFile(calls, 'c.jpg', fixture('photo.jpg'));
      const done = editor((await calls.complete(session.uploadId).expect(200)).body);
      expect(done.draft?.revision).toBe(2);
      expect(
        editor((await o.save(draftBody(2, { corners: 'round' })).expect(200)).body).draft,
      ).toMatchObject({
        revision: 3,
        settings: { corners: 'round' },
      });
    });

    test('I1: a stale tab cannot save into or publish a newer draft that reuses a number', async () => {
      const o = await owner();
      // Tab A: an image-only draft (no save yet), revision r1.
      const a = editor((await o.fromFrame('cover', (await frame(o, 'a.jpg')).id).expect(200)).body);
      const r1 = a.draft?.revision ?? 0;
      // Tab B saves, publishes, then changes an image: a new draft.
      const b = editor((await o.save(draftBody(null, { accent: '#8B5CF6' })).expect(200)).body);
      await o.publish(b.draft?.revision ?? 0).expect(200);
      const again = editor(
        (await o.fromFrame('background', (await frame(o, 'b.jpg')).id).expect(200)).body,
      );
      expect(again.draft?.revision).not.toBe(r1);
      // Tab A autosaves and publishes from r1: both are conflicts, B's page stays live.
      await o.save(draftBody(r1, { accent: '#2C7350' })).expect(409);
      await o.publish(r1).expect(409);
      expect(editor((await o.get().expect(200)).body).published.settings.accent).toBe('#8B5CF6');
    });

    test('I2: a tab’s first save takes the draft its own image change created', async () => {
      const o = await owner();
      const withImage = editor((await o.fromFrame('cover', (await frame(o)).id).expect(200)).body);
      expect(withImage.draft).not.toBeNull();
      // The editor still thought there was no draft: baseRevision null is accepted once.
      const saved = editor((await o.save(draftBody(null, { align: 'center' })).expect(200)).body);
      expect(saved.draft).toMatchObject({ settings: { align: 'center' } });
      expect(saved.draft?.cover).not.toBeNull();
      // After that save, null is a conflict again.
      await o.save(draftBody(null)).expect(409);
    });

    test('the slice 8a routes are gone: PATCH welcomeMessage → 400, /cover → 404', async () => {
      const o = await owner();
      const patch = await request(s.server)
        .patch(`/api/v1/collections/${o.collectionId}`)
        .set('Cookie', o.cookie)
        .set('Origin', ORIGIN)
        .send({ welcomeMessage: 'Вітаємо!' })
        .expect(400);
      expect(patch.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      const item = await frame(o);
      for (const call of [
        request(s.server).post(`/api/v1/collections/${o.collectionId}/cover/from-frame`),
        request(s.server).delete(`/api/v1/collections/${o.collectionId}/cover`),
        request(s.server).post(`/api/v1/collections/${o.collectionId}/cover/uploads`),
      ]) {
        await call
          .set('Cookie', o.cookie)
          .set('Origin', ORIGIN)
          .send({ contentItemId: item.id })
          .expect(404);
      }
      expect(await prisma.collectionImage.count()).toBe(0);
    });

    test('M3: a draft cover upload cannot be completed through the other slot', async () => {
      const o = await owner();
      const calls = o.uploads('cover');
      const session = await uploadFile(calls, 'c.jpg', fixture('photo.jpg'));
      await o.uploads('background').complete(session.uploadId).expect(404);
      await calls.complete(session.uploadId).expect(200);
    });

    test('two saves with the same base at once: one 200, one 409', async () => {
      const o = await owner();
      await o.save(draftBody(null)).expect(200);
      const results = await Promise.all([
        o.save(draftBody(2, { accent: '#8B5CF6' })),
        o.save(draftBody(2, { accent: '#2C7350' })),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(editor((await o.get().expect(200)).body).draft?.revision).toBe(3);
    });
  });

  describe('Review Focus 3: crafted settings', () => {
    test.each([
      [
        'classic + coverPlacement full',
        draftBody(null, { coverPlacement: 'full' }),
        [['settings', 'coverPlacement']],
      ],
      [
        'classic + an unknown gradient',
        draftBody(null, { background: { kind: 'gradient', preset: 'nope' } }),
        [['settings', 'background', 'preset']],
      ],
      [
        'dim 10 on classic',
        draftBody(null, { background: { kind: 'image', dim: 10 } }),
        [['settings', 'background', 'dim']],
      ],
      [
        'a background colour classic does not offer',
        draftBody(null, { background: { kind: 'solid', color: '#123456' } }),
        [['settings', 'background', 'color']],
      ],
      ['an unknown template', { ...draftBody(null), templateId: 'gone' }, [['templateId']]],
    ])('%s → 400 with the path', async (_name, body, paths) => {
      const o = await owner();
      const problem = problemDetailsSchema.parse((await o.save(body).expect(400)).body);
      expect(problem.code).toBe('VALIDATION_FAILED');
      expect(problem.errors?.map((issue) => issue.path)).toEqual(paths);
      expect(editor((await o.get().expect(200)).body).draft).toBeNull();
    });

    test("accent 'red' → 400 (the contract)", async () => {
      const o = await owner();
      const res = await o
        .save({ ...draftBody(null), settings: { ...settings(), accent: 'red' } })
        .expect(400);
      expect(problemDetailsSchema.parse(res.body).errors?.[0]?.path).toEqual([
        'settings',
        'accent',
      ]);
    });

    test('a stored page with a removed template reads as classic defaults, for the owner and guests', async () => {
      const o = await owner();
      await prisma.$executeRaw`
        UPDATE "GuestPageVersion" SET "templateId" = 'gone', "settings" = '{"x":1}'::jsonb
        WHERE "collectionId" = ${o.collectionId}::uuid`;
      const body = editor((await o.get().expect(200)).body);
      expect(body.published).toMatchObject({ templateId: 'classic', settings: classic.defaults });
      const context = guestContextSchema.parse((await o.context().expect(200)).body);
      expect(context.page).toMatchObject({ templateId: 'classic', settings: classic.defaults });
    });
  });

  describe('authorization', () => {
    const routes = (o: Owner, cookie: string) => {
      const as = o.as(cookie);
      const uploadId = randomUUID();
      const frameId = randomUUID();
      return [
        as.get(),
        as.save(draftBody(null)),
        as.reset(),
        as.publish(1),
        as.fromFrame('cover', frameId),
        as.removeImage('background'),
        as.uploads('cover').initiate({ filename: 'a.jpg', sizeBytes: 1000 }),
        as.uploads('cover').parts(uploadId, [1]),
        as.uploads('cover').complete(uploadId),
        as.uploads('cover').cancel(uploadId),
      ];
    };

    test('another admin gets 404 on every route; nothing changes', async () => {
      const o = await owner();
      await o.save(draftBody(null)).expect(200);
      const other = await signInAs(s.app, prisma, `other-${randomUUID()}@example.com`);
      for (const call of routes(o, other.cookie)) {
        expect((await call).status).toBe(404);
      }
      expect(editor((await o.get().expect(200)).body).draft?.revision).toBe(2);
    });

    test('a guest cookie gets 401 on every route', async () => {
      const o = await owner();
      for (const call of routes(o, o.guestCookie)) {
        expect((await call).status).toBe(401);
      }
    });

    test('archived: every change is 409 COLLECTION_ARCHIVED; GET still works', async () => {
      const o = await owner();
      await o.save(draftBody(null)).expect(200);
      const photo = await frame(o);
      await prisma.collection.update({
        where: { id: o.collectionId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await o.get().expect(200);
      for (const res of await Promise.all([
        o.save(draftBody(2)),
        o.reset(),
        o.publish(2),
        o.fromFrame('cover', photo.id),
        o.removeImage('cover'),
        o.uploads('background').initiate({ filename: 'a.jpg', sizeBytes: 1000 }),
      ])) {
        expect([res.status, problemDetailsSchema.parse(res.body).code]).toEqual([
          409,
          'COLLECTION_ARCHIVED',
        ]);
      }
      expect(editor((await o.get().expect(200)).body).draft?.revision).toBe(2);
    });
  });
});

describe('guest page editor API: quota', () => {
  let q: Started;

  beforeAll(async () => {
    q = await startApp(
      testEnv({ ...UPLOAD_ENV, LIMIT_STORAGE_BYTES_PER_COLLECTION: String(10 * MB) }),
    );
  });

  afterAll(async () => {
    await q.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('a draft background that does not fit → 409 QUOTA_EXCEEDED, nothing under background/', async () => {
    const o = await owner(q);
    const header = fixture('photo.jpg').subarray(0, 4096);
    const big = await frame(o, 'big.jpg', bigBuffer(6 * MB, header));
    const refused = await o.fromFrame('background', big.id).expect(409);
    expect(refused.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await images(o.collectionId)).toEqual([]);
    expect(await allKeys(storage, `collections/${o.collectionId}/background/`)).toEqual([]);
    await o
      .uploads('background')
      .initiate({ filename: 'bg.jpg', sizeBytes: 5 * MB })
      .expect(409);
  });
});
