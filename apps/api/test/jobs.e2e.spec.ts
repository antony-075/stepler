import { randomUUID } from 'node:crypto';
import { JOB_NAMES } from '../src/jobs/job-names.js';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL } from './support/env.js';

const prisma = createTestPrisma();
const client = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(client);

class Rollback extends Error {}

describe('PgBossQueue (transactional enqueue, spike S7)', () => {
  beforeAll(async () => {
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('ready starts the queue outside any transaction', async () => {
    const freshClient = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
    const fresh = new PgBossQueue(freshClient);
    try {
      await fresh.ready();
      await fresh.ready();
    } finally {
      await freshClient.stop();
    }
  });

  test('a job enqueued in a transaction that rolls back does not exist', async () => {
    const contentItemId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await queue.enqueue(tx, 'content.purge', { contentItemId });
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    expect(await queuedJobs(prisma)).toEqual([]);
  });

  test('a committed transaction leaves one job with the payload and the entity key', async () => {
    const contentItemId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await queue.enqueue(tx, 'content.purge', { contentItemId, requestId: 'req-12345678' });
    });
    const jobs = await queuedJobs(prisma);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: 'content.purge',
      data: { contentItemId, requestId: 'req-12345678' },
      singletonKey: `content.purge:${contentItemId}`,
    });
  });

  test('two enqueues with the same singleton key leave one job', async () => {
    const contentItemId = randomUUID();
    for (let i = 0; i < 2; i += 1) {
      await prisma.$transaction(async (tx) => {
        await queue.enqueue(tx, 'content.purge', { contentItemId });
      });
    }
    await prisma.$transaction(async (tx) => {
      await queue.enqueue(
        tx,
        'content.purge',
        { contentItemId: randomUUID() },
        {
          singletonKey: `content.purge:${contentItemId}`,
        },
      );
    });
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(1);
  });

  test('different entities get separate jobs', async () => {
    await prisma.$transaction(async (tx) => {
      await queue.enqueue(tx, 'collection.purge', { collectionId: randomUUID() });
      await queue.enqueue(tx, 'collection.purge', { collectionId: randomUUID() });
    });
    expect(await queuedJobs(prisma, 'collection.purge')).toHaveLength(2);
  });

  test('startAfterSeconds delays the job', async () => {
    await prisma.$transaction(async (tx) => {
      await queue.enqueue(tx, 'maintenance.sweep', {}, { startAfterSeconds: 60 });
    });
    const [job] = await queuedJobs(prisma, 'maintenance.sweep');
    expect(job).toBeDefined();
    const delay = (job!.startAfter.getTime() - job!.createdOn.getTime()) / 1000;
    expect(delay).toBeGreaterThanOrEqual(59);
    expect(delay).toBeLessThanOrEqual(61);
  });

  test('start is idempotent and queues use the exclusive policy', async () => {
    await client.start();
    // pg-boss may add internal queues (e.g. for schedules); ours are the job names.
    const rows = await prisma.$queryRawUnsafe<{ name: string; policy: string }[]>(
      `SELECT name, policy FROM pgboss.queue WHERE name = ANY($1::text[]) ORDER BY name`,
      JOB_NAMES,
    );
    expect(rows.map((row) => row.name)).toEqual([...JOB_NAMES].sort());
    expect(new Set(rows.map((row) => row.policy))).toEqual(new Set(['exclusive']));
  });
});
