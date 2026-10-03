import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import type { ObjectStorage } from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { MaintenanceSweepHandler } from '../src/worker/handlers/maintenance-sweep.handler.js';
import { PurgeCollectionHandler } from '../src/worker/handlers/purge-collection.handler.js';
import { PurgeContentHandler } from '../src/worker/handlers/purge-content.handler.js';
import { WorkerModule } from '../src/worker/worker.module.js';
import { loadWorkerEnv, type WorkerEnv } from '../src/worker/worker-env.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { allKeys, putObject } from './support/storage.js';

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
    await app.init();
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

    test('deletes long-idle guest sessions that contributed nothing', async () => {
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

      await sweep({ GUEST_SESSION_IDLE_DAYS: '30', WORKER_PURGE_BATCH_SIZE: '1' }).handle();

      const left = await prisma.guestSession.findMany({ select: { id: true } });
      expect(left.map((row) => row.id).sort()).toEqual([idleWithContent.id, recent.id].sort());
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
    });
  });

  describe('worker process', () => {
    let worker: INestApplicationContext;

    afterAll(async () => {
      await worker.close();
    });

    test('runs a queued purge job', { timeout: 20_000 }, async () => {
      worker = await NestFactory.createApplicationContext(WorkerModule.forRoot({ env }), {
        logger: false,
      });
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
    });
  });
});
