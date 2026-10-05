import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { MaintenanceSweepHandler } from '../src/worker/handlers/maintenance-sweep.handler.js';
import { PurgeCollectionHandler } from '../src/worker/handlers/purge-collection.handler.js';
import { PurgeContentHandler } from '../src/worker/handlers/purge-content.handler.js';
import {
  LegacyPurgeCoverHandler,
  PurgeCollectionImageHandler,
} from '../src/worker/handlers/purge-collection-image.handler.js';
import { imageKey, imagePrefix } from '../src/images/image-keys.js';
import { shutdownWorker } from '../src/worker/shutdown.js';
import { WorkerModule } from '../src/worker/worker.module.js';
import { loadWorkerEnv, type WorkerEnv } from '../src/worker/worker-env.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys, putObject } from './support/storage.js';

const coverPrefix = (collectionId: string, id: string) => imagePrefix(collectionId, 'COVER', id);

const apiEnv = testEnv();
const workerEnv = (overrides: Record<string, string> = {}): WorkerEnv =>
  loadWorkerEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: TEST_DATABASE_URL,
    S3_ENDPOINT: apiEnv.S3_ENDPOINT,
    S3_REGION: apiEnv.S3_REGION,
    S3_BUCKET: apiEnv.S3_BUCKET,
    S3_ACCESS_KEY_ID: apiEnv.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: apiEnv.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: 'true',
    WORKER_PURGE_BATCH_SIZE: '3',
    ...overrides,
  });

const env = workerEnv();
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** Fails `deleteMany` from the given call on, to interrupt a purge midway. */
function failingFrom(call: number): ObjectStorage {
  let calls = 0;
  return Object.assign(Object.create(storage) as ObjectStorage, {
    deleteMany: async (keys: readonly string[]) => {
      calls += 1;
      if (calls >= call) throw new Error('storage unavailable');
      await storage.deleteMany(keys);
    },
  });
}

let tokens: GuestLinkTokens;
let app: INestApplication;

async function seed(options: { status?: 'ACTIVE' | 'DELETING'; deletedHoursAgo?: number } = {}) {
  const { collectionId, link } = await seedCollection(prisma, tokens);
  if (options.status === 'DELETING') {
    await prisma.collection.update({
      where: { id: collectionId },
      data: {
        status: 'DELETING',
        deletionRequestedAt: new Date(Date.now() - (options.deletedHoursAgo ?? 2) * HOUR_MS),
      },
    });
  }
  return { collectionId, linkId: link.id };
}

async function addItem(collectionId: string, frameNo: number, deletedAt: Date | null = new Date()) {
  return prisma.contentItem.create({
    data: {
      collectionId,
      frameNo,
      kind: 'TEXT',
      textBody: `Побажання ${frameNo}`,
      processingStatus: 'NOT_REQUIRED',
      deletedAt,
    },
  });
}

async function addSession(collectionId: string, linkId: string, lastSeenAt = new Date()) {
  return prisma.guestSession.create({
    data: { collectionId, currentLinkId: linkId, tokenHash: randomUUID(), lastSeenAt },
  });
}

describe('worker handlers', () => {
  beforeAll(async () => {
    app = await createApp(apiEnv);
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
    await boss.start();
  });

  afterAll(async () => {
    await app.close();
    await boss.stop();
    storage.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('content.purge', () => {
    const handler = () => new PurgeContentHandler(prisma, storage, env);

    test('removes derived objects and the row; a second run succeeds', async () => {
      const { collectionId } = await seed();
      const item = await addItem(collectionId, 1);
      const other = await addItem(collectionId, 2);
      const prefix = `collections/${collectionId}/derived/${item.id}/`;
      await putObject(storage, `${prefix}thumbnail.webp`);
      await putObject(storage, `${prefix}preview.webp`);
      await putObject(storage, `collections/${collectionId}/derived/${other.id}/thumbnail.webp`);

      await handler().handle({ contentItemId: item.id });
      expect(await prisma.contentItem.findUnique({ where: { id: item.id } })).toBeNull();
      expect(await allKeys(storage, prefix)).toEqual([]);
      expect(await allKeys(storage, `collections/${collectionId}/`)).toHaveLength(1);
      expect(await prisma.contentItem.findUnique({ where: { id: other.id } })).not.toBeNull();

      await handler().handle({ contentItemId: item.id });
    });

    test('an upper-case id in the payload still deletes the objects (keys are lowercase)', async () => {
      const { collectionId } = await seed();
      const item = await addItem(collectionId, 1);
      const prefix = `collections/${collectionId}/derived/${item.id}/`;
      await putObject(storage, `${prefix}thumbnail.webp`);
      await handler().handle({ contentItemId: item.id.toUpperCase() });
      expect(await allKeys(storage, prefix)).toEqual([]);
      expect(await prisma.contentItem.count({ where: { id: item.id } })).toBe(0);
    });

    test('succeeds when the objects are already gone', async () => {
      const { collectionId } = await seed();
      const item = await addItem(collectionId, 1);
      await handler().handle({ contentItemId: item.id });
      expect(await prisma.contentItem.count()).toBe(0);
    });

    test('never purges an item that is not deleted', async () => {
      const { collectionId } = await seed();
      const item = await addItem(collectionId, 1, null);
      const key = `collections/${collectionId}/derived/${item.id}/thumbnail.webp`;
      await putObject(storage, key);
      await handler().handle({ contentItemId: item.id });
      expect(await prisma.contentItem.findUnique({ where: { id: item.id } })).not.toBeNull();
      expect(await storage.head(key)).not.toBeNull();
    });
  });

  describe('collection-image.purge', () => {
    const handler = () => new PurgeCollectionImageHandler(prisma, storage, env);

    /** A READY image with its objects; `live: false` deletes the row as garbage collection would. */
    async function image(
      collectionId: string,
      live: boolean,
      slot: 'COVER' | 'BACKGROUND' | 'COLLECTION_IMAGE' = 'COVER',
    ) {
      const row = await prisma.collectionImage.create({
        data: {
          collectionId,
          slot,
          status: 'READY',
          source: 'UPLOAD',
          mimeType: 'image/jpeg',
          originalSizeBytes: 1000n,
          derivedSizeBytes: 200n,
          width: 100,
          height: 100,
        },
      });
      for (const role of ['original', 'thumbnail', 'preview'] as const) {
        await putObject(storage, imageKey(collectionId, slot, row.id, role));
      }
      if (!live) await prisma.collectionImage.delete({ where: { id: row.id } });
      return row.id;
    }

    test('removes the prefix of an image whose row is gone; a second run succeeds', async () => {
      const { collectionId } = await seed();
      const gone = await image(collectionId, false, 'BACKGROUND');
      const live = await image(collectionId, true, 'BACKGROUND');
      await handler().handle({ collectionId, imageId: gone, slot: 'BACKGROUND' });
      expect(await allKeys(storage, imagePrefix(collectionId, 'BACKGROUND', gone))).toEqual([]);
      expect(await allKeys(storage, imagePrefix(collectionId, 'BACKGROUND', live))).toHaveLength(3);
      await handler().handle({ collectionId, imageId: gone, slot: 'BACKGROUND' });
    });

    test('Review Focus 1: never purges an image a version still references (its row lives)', async () => {
      const { collectionId } = await seed();
      const kept = await image(collectionId, true);
      await prisma.guestPageVersion.create({
        data: {
          collectionId,
          state: 'DRAFT',
          templateId: 'classic',
          templateVersion: 1,
          settings: {},
          coverImageId: kept,
        },
      });
      await handler().handle({ collectionId, imageId: kept, slot: 'COVER' });
      expect(await allKeys(storage, coverPrefix(collectionId, kept))).toHaveLength(3);
      expect(await prisma.collectionImage.count({ where: { id: kept } })).toBe(1);
    });

    test('upper-case ids in the payload still delete the (lowercase) keys', async () => {
      const { collectionId } = await seed();
      const gone = await image(collectionId, false, 'COLLECTION_IMAGE');
      await handler().handle({
        collectionId: collectionId.toUpperCase(),
        imageId: gone.toUpperCase(),
        slot: 'COLLECTION_IMAGE',
      });
      expect(await allKeys(storage, imagePrefix(collectionId, 'COLLECTION_IMAGE', gone))).toEqual(
        [],
      );
    });

    test('a legacy cover.purge job ({ coverId }) purges a COVER image', async () => {
      const { collectionId } = await seed();
      const gone = await image(collectionId, false);
      const legacy = new LegacyPurgeCoverHandler(handler());
      expect(legacy.name).toBe('cover.purge');
      await legacy.handle({ collectionId, coverId: gone });
      expect(await allKeys(storage, coverPrefix(collectionId, gone))).toEqual([]);
    });

    test('Review Focus 1: the collection purge removes the images with everything else', async () => {
      const { collectionId } = await seed({ status: 'DELETING' });
      await image(collectionId, true);
      await image(collectionId, true, 'BACKGROUND');
      await putObject(storage, `collections/${collectionId}/uploads/u1/original`);
      await new PurgeCollectionHandler(prisma, storage, env).handle({ collectionId });
      expect(await allKeys(storage, `collections/${collectionId}/`)).toEqual([]);
      expect(await prisma.collection.count({ where: { id: collectionId } })).toBe(0);
      expect(await prisma.collectionImage.count({ where: { collectionId } })).toBe(0);
    });
  });

  describe('collection.purge', () => {
    test('a run interrupted after the first batch is finished by a rerun', async () => {
      const { collectionId, linkId } = await seed({ status: 'DELETING' });
      const session = await addSession(collectionId, linkId);
      await prisma.contentItem.create({
        data: {
          collectionId,
          frameNo: 1,
          kind: 'TEXT',
          textBody: 'Привіт',
          processingStatus: 'NOT_REQUIRED',
          contributorGuestSessionId: session.id,
        },
      });
      await prisma.auditEvent.create({
        data: {
          collectionId,
          actorType: 'ADMIN',
          action: 'collection.delete',
          targetType: 'collection',
          targetId: collectionId,
        },
      });
      const prefix = `collections/${collectionId}/`;
      for (let i = 0; i < 7; i += 1) await putObject(storage, `${prefix}originals/${i}`);

      const interrupted = new PurgeCollectionHandler(prisma, failingFrom(2), env);
      await expect(interrupted.handle({ collectionId })).rejects.toThrow('storage unavailable');
      expect(await allKeys(storage, prefix)).toHaveLength(4);
      expect(await prisma.collection.count({ where: { id: collectionId } })).toBe(1);

      await new PurgeCollectionHandler(prisma, storage, env).handle({ collectionId });
      expect(await allKeys(storage, prefix)).toEqual([]);
      expect(await prisma.collection.count({ where: { id: collectionId } })).toBe(0);
      expect(await prisma.guestSession.count({ where: { collectionId } })).toBe(0);
      expect(await prisma.guestLink.count({ where: { collectionId } })).toBe(0);
      expect(await prisma.contentItem.count({ where: { collectionId } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { collectionId } })).toBe(1);

      await new PurgeCollectionHandler(prisma, storage, env).handle({ collectionId });
    });

    test('an upper-case id in the payload still deletes the objects', async () => {
      const { collectionId } = await seed({ status: 'DELETING' });
      const prefix = `collections/${collectionId}/`;
      await putObject(storage, `${prefix}originals/a`);
      await new PurgeCollectionHandler(prisma, storage, env).handle({
        collectionId: collectionId.toUpperCase(),
      });
      expect(await allKeys(storage, prefix)).toEqual([]);
      expect(await prisma.collection.count({ where: { id: collectionId } })).toBe(0);
    });

    test('leaves a collection that is not DELETING alone', async () => {
      const { collectionId } = await seed();
      const key = `collections/${collectionId}/originals/a`;
      await putObject(storage, key);
      await new PurgeCollectionHandler(prisma, storage, env).handle({ collectionId });
      expect(await prisma.collection.count({ where: { id: collectionId } })).toBe(1);
      expect(await storage.head(key)).not.toBeNull();
    });
  });

  describe('maintenance.sweep', () => {
    const sweep = (overrides: Record<string, string> = {}) =>
      new MaintenanceSweepHandler(prisma, queue, workerEnv(overrides));

    test('fails photos and videos stuck PENDING for an hour with no media job left', async () => {
      const { collectionId } = await seed();
      const media = (frameNo: number, kind: 'PHOTO' | 'VIDEO', hoursAgo: number) =>
        prisma.contentItem.create({
          data: {
            collectionId,
            frameNo,
            kind,
            processingStatus: 'PENDING',
            createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
          },
        });
      const stuck = await media(1, 'PHOTO', 2);
      const queued = await media(2, 'VIDEO', 2);
      const recent = await media(3, 'PHOTO', 0);
      await prisma.$transaction((tx) =>
        queue.enqueue(tx, 'media.video-poster', { contentItemId: queued.id }),
      );

      await sweep().handle();

      const status = async (id: string) =>
        (await prisma.contentItem.findUniqueOrThrow({ where: { id } })).processingStatus;
      expect(await status(stuck.id)).toBe('FAILED');
      expect(await status(queued.id)).toBe('PENDING');
      expect(await status(recent.id)).toBe('PENDING');
    });

    test('fails admin images stuck PENDING for an hour with no rendition job left (deploy window)', async () => {
      const { collectionId } = await seed();
      const hourAgo = new Date(Date.now() - 2 * 3600_000);
      const image = (createdAt: Date, slot: 'COVER' | 'BACKGROUND' = 'COVER') =>
        prisma.collectionImage.create({
          data: {
            collectionId,
            slot,
            source: 'UPLOAD',
            mimeType: 'image/jpeg',
            originalSizeBytes: 1000n,
            createdAt,
          },
        });
      const lost = await image(hourAgo, 'BACKGROUND');
      const queued = await image(hourAgo);
      const legacyQueued = await image(hourAgo);
      const recent = await image(new Date());
      await prisma.$transaction(async (tx) => {
        await queue.enqueue(tx, 'media.collection-image', { collectionId, imageId: queued.id });
        await queue.enqueue(tx, 'media.cover-derivatives', {
          collectionId,
          coverId: legacyQueued.id,
        });
      });
      await sweep().handle();
      const status = async (id: string) =>
        (await prisma.collectionImage.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(lost.id)).toBe('FAILED');
      expect(await status(queued.id)).toBe('PENDING');
      expect(await status(legacyQueued.id)).toBe('PENDING');
      expect(await status(recent.id)).toBe('PENDING');
    });

    test('backfill: queues the media job of READY photos, videos and images not sanitised yet', async () => {
      const { collectionId } = await seed();
      const deleting = await seed({ status: 'DELETING' });
      const media = (
        frameNo: number,
        kind: 'PHOTO' | 'VIDEO' | 'DOCUMENT',
        data: {
          sanitizedAt?: Date;
          sanitizeFailedAt?: Date;
          processingStatus?: 'PENDING' | 'READY' | 'FAILED';
        } = {},
        inCollection = collectionId,
      ) =>
        prisma.contentItem.create({
          data: {
            collectionId: inCollection,
            frameNo,
            kind,
            processingStatus: kind === 'DOCUMENT' ? 'NOT_REQUIRED' : 'READY',
            ...data,
          },
        });
      const oldPhoto = await media(1, 'PHOTO');
      const oldVideo = await media(2, 'VIDEO');
      await media(3, 'PHOTO', { sanitizedAt: new Date() });
      await media(8, 'VIDEO', { sanitizeFailedAt: new Date() }); // given up: admin-only
      await media(4, 'PHOTO', { processingStatus: 'PENDING' }); // its own job sanitises it
      await media(5, 'PHOTO', { processingStatus: 'FAILED' }); // admin-only, never retried
      await media(6, 'DOCUMENT');
      await media(1, 'PHOTO', {}, deleting.collectionId);
      await prisma.contentItem.update({
        where: { id: (await media(7, 'PHOTO')).id },
        data: { deletedAt: new Date() },
      });
      const image = (
        data: { sanitizedAt?: Date; sanitizeFailedAt?: Date; status?: 'READY' | 'PENDING' } = {},
      ) =>
        prisma.collectionImage.create({
          data: {
            collectionId,
            slot: 'COVER',
            source: 'UPLOAD',
            mimeType: 'image/jpeg',
            originalSizeBytes: 1000n,
            status: 'READY',
            width: 10,
            height: 10,
            ...data,
          },
        });
      const oldImage = await image();
      await image({ sanitizedAt: new Date() });
      await image({ sanitizeFailedAt: new Date() });

      await sweep().handle();
      await sweep().handle();

      const data = async (name: Parameters<typeof queuedJobs>[1]) =>
        (await queuedJobs(prisma, name)).map((job) => job.data);
      expect(await data('media.image-derivatives')).toEqual([{ contentItemId: oldPhoto.id }]);
      expect(await data('media.video-poster')).toEqual([{ contentItemId: oldVideo.id }]);
      expect(await data('media.collection-image')).toEqual([
        { collectionId, imageId: oldImage.id },
      ]);
    });

    test('re-enqueues purges for old DELETING collections and old deleted items only', async () => {
      const stale = await seed({ status: 'DELETING', deletedHoursAgo: 2 });
      const recent = await seed({ status: 'DELETING', deletedHoursAgo: 0.1 });
      const active = await seed();
      const oldItem = await addItem(active.collectionId, 1, new Date(Date.now() - 2 * HOUR_MS));
      await addItem(active.collectionId, 2, new Date());
      await addItem(active.collectionId, 3, null);

      await sweep().handle();
      await sweep().handle();

      const collectionJobs = await queuedJobs(prisma, 'collection.purge');
      expect(collectionJobs.map((job) => job.data)).toEqual([{ collectionId: stale.collectionId }]);
      expect(collectionJobs.map((job) => job.data)).not.toContainEqual({
        collectionId: recent.collectionId,
      });
      const contentJobs = await queuedJobs(prisma, 'content.purge');
      expect(contentJobs.map((job) => job.data)).toEqual([{ contentItemId: oldItem.id }]);
    });

    test('enqueues a backlog in short transactions', async () => {
      const { collectionId } = await seed();
      const deletedAt = new Date(Date.now() - 2 * HOUR_MS);
      await prisma.contentItem.createMany({
        data: Array.from({ length: 120 }, (_, i) => ({
          collectionId,
          frameNo: i + 1,
          kind: 'TEXT' as const,
          textBody: `#${i + 1}`,
          processingStatus: 'NOT_REQUIRED' as const,
          deletedAt,
        })),
      });
      await sweep({ WORKER_PURGE_BATCH_SIZE: '1000' }).handle();
      expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(120);
    });

    test('still cleans up idle sessions when enqueueing fails, then reports the failure', async () => {
      const { collectionId, linkId } = await seed();
      await addItem(collectionId, 1, new Date(Date.now() - 2 * HOUR_MS));
      await addSession(collectionId, linkId, new Date(Date.now() - 31 * DAY_MS));
      const broken = {
        ready: () => Promise.resolve(),
        enqueue: () => Promise.reject(new Error('queue down')),
      };
      const handler = new MaintenanceSweepHandler(
        prisma,
        broken,
        workerEnv({ GUEST_SESSION_IDLE_DAYS: '30' }),
      );
      await expect(handler.handle()).rejects.toThrow('queue down');
      expect(await prisma.guestSession.count()).toBe(0);
    });

    test('deletes long-idle guest sessions that contributed nothing and have no uploads', async () => {
      const { collectionId, linkId } = await seed();
      const longAgo = new Date(Date.now() - 31 * DAY_MS);
      const idle = await addSession(collectionId, linkId, longAgo);
      const idleWithContent = await addSession(collectionId, linkId, longAgo);
      const recent = await addSession(collectionId, linkId, new Date(Date.now() - 29 * DAY_MS));
      await prisma.contentItem.create({
        data: {
          collectionId,
          frameNo: 1,
          kind: 'TEXT',
          textBody: 'Вітаю',
          processingStatus: 'NOT_REQUIRED',
          contributorGuestSessionId: idleWithContent.id,
          deletedAt: new Date(),
        },
      });

      const idleWithUpload = await addSession(collectionId, linkId, longAgo);
      await prisma.uploadSession.create({
        data: {
          collectionId,
          guestSessionId: idleWithUpload.id,
          guestLinkId: linkId,
          clientUploadId: randomUUID(),
          kind: 'PHOTO',
          originalFilename: 'IMG_1.jpg',
          declaredMime: 'image/jpeg',
          declaredSizeBytes: 1000n,
          storageKey: `collections/${collectionId}/uploads/${randomUUID()}/original`,
          multipartUploadId: 'mp',
          partSizeBytes: 10_485_760n,
          partCount: 1,
          status: 'REJECTED',
          rejectReason: 'FILE_TYPE_NOT_ALLOWED',
          expiresAt: longAgo,
        },
      });

      await sweep({ GUEST_SESSION_IDLE_DAYS: '30', WORKER_PURGE_BATCH_SIZE: '1' }).handle();

      const left = await prisma.guestSession.findMany({ select: { id: true } });
      expect(left.map((row) => row.id).sort()).toEqual(
        [idleWithContent.id, idleWithUpload.id, recent.id].sort(),
      );
      expect(left.map((row) => row.id)).not.toContain(idle.id);
    });
  });

  describe('API deletes enqueue exactly one purge job', () => {
    const server = (): Server => app.getHttpServer() as Server;

    test('DELETE /content/:id', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
      const item = await addItem(collectionId, 1, null);
      for (let i = 0; i < 2; i += 1) {
        await request(server())
          .delete(`/api/v1/content/${item.id}`)
          .set('Cookie', owner.cookie)
          .set('Origin', ORIGIN)
          .expect(204);
      }
      const jobs = await queuedJobs(prisma);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        name: 'content.purge',
        data: { contentItemId: item.id },
        singletonKey: `content.purge:${item.id}`,
      });
      expect(jobs[0]?.data).toHaveProperty('requestId');
    });

    test('an upper-case id in the URL enqueues the canonical (stored) ids', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
      const item = await addItem(collectionId, 1, null);
      await request(server())
        .delete(`/api/v1/content/${item.id.toUpperCase()}`)
        .set('Cookie', owner.cookie)
        .set('Origin', ORIGIN)
        .expect(204);
      await request(server())
        .delete(`/api/v1/collections/${collectionId.toUpperCase()}`)
        .set('Cookie', owner.cookie)
        .set('Origin', ORIGIN)
        .expect(204);
      const jobs = await queuedJobs(prisma);
      expect(jobs.map((job) => [job.singletonKey, job.data])).toEqual([
        [`content.purge:${item.id}`, expect.objectContaining({ contentItemId: item.id })],
        [`collection.purge:${collectionId}`, expect.objectContaining({ collectionId })],
      ]);
    });

    test('DELETE /collections/:id', async () => {
      const owner = await signInAs(app, prisma, 'olena@example.com');
      const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
      for (let i = 0; i < 2; i += 1) {
        await request(server())
          .delete(`/api/v1/collections/${collectionId}`)
          .set('Cookie', owner.cookie)
          .set('Origin', ORIGIN)
          .expect(204);
      }
      const jobs = await queuedJobs(prisma);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ name: 'collection.purge', data: { collectionId } });
      // Scheduled after every upload URL issued before the deletion has expired (TTL + 1 h).
      const delayMs = (jobs[0]?.startAfter.getTime() ?? 0) - (jobs[0]?.createdOn.getTime() ?? 0);
      expect(Math.round(delayMs / 1000)).toBe(900 + 3600);
    });
  });

  describe('worker process', () => {
    test('runs a queued purge job', { timeout: 20_000 }, async () => {
      const worker = await NestFactory.createApplicationContext(WorkerModule.forRoot({ env }), {
        logger: false,
      });
      try {
        const { collectionId } = await seed();
        const item = await addItem(collectionId, 1);
        await prisma.$transaction(async (tx) => {
          await queue.enqueue(tx, 'content.purge', { contentItemId: item.id });
        });
        await expect
          .poll(() => prisma.contentItem.count({ where: { id: item.id } }), {
            timeout: 15_000,
            interval: 250,
          })
          .toBe(0);
      } finally {
        await shutdownWorker(worker);
      }
    });

    test(
      'shutdown lets a running job finish before the clients close',
      { timeout: 30_000 },
      async () => {
        const events: string[] = [];
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const slowStorage = Object.assign(Object.create(storage) as ObjectStorage, {
          listKeys: async () => {
            events.push('job running');
            await gate;
            events.push('job storage call done');
            return { keys: [] };
          },
          onModuleDestroy: () => {
            events.push('storage closed');
          },
        });
        const worker = await Test.createTestingModule({ imports: [WorkerModule.forRoot({ env })] })
          .overrideProvider(OBJECT_STORAGE)
          .useValue(slowStorage)
          .compile();
        worker.useLogger(false);
        await worker.init();

        const { collectionId } = await seed();
        const item = await addItem(collectionId, 1);
        await prisma.$transaction(async (tx) => {
          await queue.enqueue(tx, 'content.purge', { contentItemId: item.id });
        });
        await expect.poll(() => events.includes('job running'), { timeout: 15_000 }).toBe(true);

        const stopped = shutdownWorker(worker);
        setTimeout(release, 500);
        await stopped;

        expect(events).toEqual(['job running', 'job storage call done', 'storage closed']);
        expect(await prisma.contentItem.count({ where: { id: item.id } })).toBe(0);
        const [job] = await prisma.$queryRawUnsafe<{ state: string }[]>(
          `SELECT state FROM pgboss.job WHERE name = 'content.purge' AND data->>'contentItemId' = $1`,
          item.id,
        );
        expect(job?.state).toBe('completed');
      },
    );
  });
});
