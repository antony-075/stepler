import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  collectionDetailSchema,
  collectionListResponseSchema,
  collectionSchema,
  guestContentItemSchema,
  guestContextSchema,
  problemDetailsSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { setPublishedPage } from './support/guest-page.js';
import { joinAsGuest, ORIGIN, SHARED_GALLERY, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys } from './support/storage.js';
import { collectionImageUploadCalls, fixture, uploadCalls, uploadFile } from './support/uploads.js';

// «Картинка колекції» (plan Task 10): the owner's own image of a collection, and the published
// guest page in the guest context (never the collection image, never a draft).

const env = testEnv({ UPLOAD_PART_SIZE_BYTES: '5242880' });
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
let app: Awaited<ReturnType<typeof createApp>>;
let server: Server;
let tokens: GuestLinkTokens;

async function owner() {
  const admin = await signInAs(app, prisma, `owner-${randomUUID()}@example.com`);
  const seeded = await seedCollection(prisma, tokens, {
    ownerId: admin.userId,
    permissions: SHARED_GALLERY,
  });
  const guestCookie = await joinAsGuest(server, seeded.collectionId, seeded.link.token);
  const root = `/api/v1/collections/${seeded.collectionId}/image`;
  const as = (cookie: string) => ({
    calls: collectionImageUploadCalls(server, seeded.collectionId, cookie),
    fromFrame: (contentItemId: string) =>
      request(server)
        .post(`${root}/from-frame`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ contentItemId }),
    remove: () => request(server).delete(root).set('Cookie', cookie).set('Origin', ORIGIN),
  });
  return {
    ...admin,
    ...seeded,
    guestCookie,
    guest: uploadCalls(server, seeded.collectionId, guestCookie),
    ...as(admin.cookie),
    as,
    detail: () =>
      request(server).get(`/api/v1/collections/${seeded.collectionId}`).set('Cookie', admin.cookie),
  };
}
type Owner = Awaited<ReturnType<typeof owner>>;

async function frame(o: Owner, name = 'IMG_0001.jpg') {
  const session = await uploadFile(o.guest, name, fixture('photo.jpg'));
  return guestContentItemSchema.parse((await o.guest.complete(session.uploadId).expect(200)).body);
}

const imageRows = (collectionId: string) =>
  prisma.collectionImage.findMany({ where: { collectionId, slot: 'COLLECTION_IMAGE' } });

/** Marks an image READY as the worker would (only its thumbnail for this slot). */
const ready = (id: string) =>
  prisma.collectionImage.update({
    where: { id },
    data: { status: 'READY', width: 320, height: 240, derivedSizeBytes: 100n },
  });

/** Every string in a JSON value, at any depth. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...stringsOf(inner)]);
}

describe('collection image API', () => {
  beforeAll(async () => {
    app = await createApp(env);
    await listenOnLoopback(app);
    server = app.getHttpServer() as Server;
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    storage.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('upload → PENDING → READY: the collection carries the image with its thumbnail only', async () => {
    const o = await owner();
    const session = await uploadFile(o.calls, 'mark.jpg', fixture('photo.jpg'));
    const done = collectionSchema.parse(
      (await o.calls.complete(session.uploadId).expect(200)).body,
    );
    expect(done.image).toMatchObject({ status: 'PENDING', thumbnailUrl: null });
    // The guest page cover is a different thing: the collection does not carry it.
    expect(done).not.toHaveProperty('cover');
    const [row] = await imageRows(o.collectionId);
    expect((await queuedJobs(prisma, 'media.collection-image')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: row?.id },
    ]);
    await ready(row?.id ?? '');
    const detail = collectionDetailSchema.parse((await o.detail().expect(200)).body);
    expect(detail.image).toMatchObject({ status: 'READY', width: 320, height: 240 });
    expect(detail.image?.thumbnailUrl).toMatch(/\/collection-image\/.+\/thumbnail\.webp/);
    expect(detail.image?.previewUrl).toBeNull();
    expect(detail.image?.largeUrl).toBeNull();
    const list = collectionListResponseSchema.parse(
      (await request(server).get('/api/v1/collections').set('Cookie', o.cookie).expect(200)).body,
    );
    expect(list.items[0]?.image).toMatchObject({ status: 'READY' });
  });

  test('from a frame, then remove: the row goes and its prefix is purged; again 204', async () => {
    const o = await owner();
    const photo = await frame(o);
    const set = collectionSchema.parse((await o.fromFrame(photo.id).expect(200)).body);
    expect(set.image).toMatchObject({ status: 'PENDING' });
    const [row] = await imageRows(o.collectionId);
    expect(
      await allKeys(storage, `collections/${o.collectionId}/collection-image/${row?.id}/`),
    ).toHaveLength(1);
    await o.remove().expect(204);
    expect(await imageRows(o.collectionId)).toEqual([]);
    expect((await queuedJobs(prisma, 'collection-image.purge')).map((job) => job.data)).toEqual([
      { collectionId: o.collectionId, imageId: row?.id, slot: 'COLLECTION_IMAGE' },
    ]);
    await o.remove().expect(204);
    expect(collectionDetailSchema.parse((await o.detail().expect(200)).body).image).toBeNull();
  });

  test('another admin gets 404; archived is 409 COLLECTION_ARCHIVED', async () => {
    const o = await owner();
    const photo = await frame(o);
    const other = await signInAs(app, prisma, `other-${randomUUID()}@example.com`);
    const b = o.as(other.cookie);
    await b.fromFrame(photo.id).expect(404);
    await b.remove().expect(404);
    await b.calls.initiate({ filename: 'a.jpg', sizeBytes: 1000 }).expect(404);
    await prisma.collection.update({
      where: { id: o.collectionId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    for (const res of [
      await o.fromFrame(photo.id),
      await o.remove(),
      await o.calls.initiate({ filename: 'a.jpg', sizeBytes: 1000 }),
    ]) {
      expect([res.status, problemDetailsSchema.parse(res.body).code]).toEqual([
        409,
        'COLLECTION_ARCHIVED',
      ]);
    }
  });

  test('the collection image never appears in any guest response', async () => {
    const o = await owner();
    const photo = await frame(o);
    await o.fromFrame(photo.id).expect(200);
    const [row] = await imageRows(o.collectionId);
    await ready(row?.id ?? '');
    const imageId = row?.id ?? '';
    const responses = [
      await request(server)
        .post('/api/v1/guest/links/resolve')
        .set('Origin', ORIGIN)
        .send({ linkToken: o.link.token })
        .expect(200),
      await request(server)
        .post(`/api/v1/guest/collections/${o.collectionId}/session`)
        .set('Origin', ORIGIN)
        .set('Cookie', o.guestCookie)
        .send({ linkToken: o.link.token })
        .expect(200),
      await request(server)
        .get(`/api/v1/guest/collections/${o.collectionId}/context`)
        .set('Cookie', o.guestCookie)
        .expect(200),
      await request(server)
        .get(`/api/v1/guest/collections/${o.collectionId}/content?scope=all`)
        .set('Cookie', o.guestCookie)
        .expect(200),
      await request(server)
        .get(`/api/v1/guest/collections/${o.collectionId}/content?scope=own`)
        .set('Cookie', o.guestCookie)
        .expect(200),
    ];
    for (const res of responses) {
      const strings = stringsOf(res.body);
      expect(strings.some((value) => value.includes(imageId))).toBe(false);
      expect(res.text).not.toContain('/collection-image/');
    }
  });

  describe('the published page in the guest context', () => {
    test('a READY background carries largeUrl; a PENDING one is not there at all', async () => {
      const o = await owner();
      const background = await prisma.collectionImage.create({
        data: {
          collectionId: o.collectionId,
          slot: 'BACKGROUND',
          source: 'UPLOAD',
          mimeType: 'image/jpeg',
          originalSizeBytes: 1000n,
        },
      });
      await setPublishedPage(prisma, o.collectionId, {
        backgroundImageId: background.id,
        settings: {
          background: { kind: 'image', dim: 60 },
          accent: '#B83E26',
          headingFont: 'geologica',
          coverPlacement: 'top',
          align: 'start',
          corners: 'soft',
        },
      });
      const context = async () =>
        guestContextSchema.parse(
          (
            await request(server)
              .get(`/api/v1/guest/collections/${o.collectionId}/context`)
              .set('Cookie', o.guestCookie)
              .expect(200)
          ).body,
        );
      const pending = await context();
      expect(pending.page.background).toBeNull();
      expect(pending.page.settings.background).toEqual({ kind: 'image', dim: 60 });
      await prisma.collectionImage.update({
        where: { id: background.id },
        data: { status: 'READY', width: 3000, height: 2000, derivedSizeBytes: 10n },
      });
      const withBackground = (await context()).page.background;
      expect(withBackground).toMatchObject({ width: 3000, height: 2000 });
      expect(withBackground?.largeUrl).toMatch(/\/background\/.+\/large\.webp/);
      expect(withBackground?.previewUrl).toMatch(/\/background\/.+\/preview\.webp/);
    });
  });
});
