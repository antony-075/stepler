import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { LoginFailures } from '../src/auth/login-failures.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ContentDeletion } from '../src/content/content-deletion.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { RateLimitStore } from '../src/limits/rate-limit-store.js';
import { MaintenanceSweepHandler } from '../src/worker/handlers/maintenance-sweep.handler.js';
import { resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';

// Launch checklist 4.4: rate limits and sign-in failures counted in PostgreSQL, so two API
// instances (two stores, two Prisma pools) share the same windows.

const env = testEnv();
const prismaA = new PrismaService(env);
const prismaB = new PrismaService(env);
const instanceA = new RateLimitStore(prismaA, env);
const instanceB = new RateLimitStore(prismaB, env);

afterAll(async () => {
  await prismaA.$disconnect();
  await prismaB.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prismaA);
});

describe('RateLimitStore', () => {
  test('two instances count the same window, and both refuse once it is over the limit', async () => {
    const hit = (store: RateLimitStore) => store.increment('route-ip', 60_000, 3, 60_000, 'guest');
    expect(await hit(instanceA)).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(await hit(instanceB)).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(await hit(instanceA)).toMatchObject({ totalHits: 3, isBlocked: false });
    const over = await hit(instanceB);
    expect(over).toMatchObject({ totalHits: 4, isBlocked: true });
    expect(over.timeToBlockExpire).toBeGreaterThan(55);
    expect(over.timeToBlockExpire).toBeLessThanOrEqual(60);
    // Blocked hits are not counted.
    expect(await hit(instanceA)).toMatchObject({ totalHits: 4, isBlocked: true });
    // Another limit's name or another tracker is another counter.
    expect(await instanceA.increment('route-ip', 60_000, 3, 60_000, 'other')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  test('parallel hits from both instances are all counted', async () => {
    const hits = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? instanceA : instanceB).increment('burst', 60_000, 100, 60_000, 'g'),
      ),
    );
    expect(hits.map((hit) => hit.totalHits).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  test('an ended window and an ended block start again at one', async () => {
    await instanceA.increment('short', 60_000, 1, 60_000, 'g');
    expect(await instanceA.increment('short', 60_000, 1, 60_000, 'g')).toMatchObject({
      isBlocked: true,
    });
    await prismaA.$executeRaw`
      UPDATE "RateLimitCounter"
      SET "windowEndsAt" = now() - interval '1 second', "blockedUntil" = now() - interval '1 second'`;
    expect(await instanceB.increment('short', 60_000, 1, 60_000, 'g')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  test('stores an HMAC of the key, never the key (which carries the IP)', async () => {
    await instanceA.increment('203.0.113.7', 60_000, 5, 60_000, 'g');
    const rows = await prismaA.rateLimitCounter.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).not.toContain('203.0.113.7');
    expect(rows[0]?.key).toMatch(/^[\w-]{43}$/);
  });

  test('sign-in failures are shared, and a success clears them for both', async () => {
    const a = new LoginFailures(instanceA);
    const b = new LoginFailures(instanceB);
    await a.record('login:x', 15 * 60_000);
    await b.record('login:x', 15 * 60_000);
    expect(await a.blockedFor('login:x', 3)).toBeNull();
    await a.record('login:x', 15 * 60_000);
    const wait = await b.blockedFor('login:x', 3);
    expect(wait).toBeGreaterThan(14 * 60);
    await a.clear('login:x');
    expect(await b.blockedFor('login:x', 3)).toBeNull();
  });

  test('the hourly sweep deletes counters whose window and block both ended', async () => {
    await instanceA.increment('ended', 60_000, 5, 60_000, 'g');
    await instanceA.increment('ended', 60_000, 5, 60_000, 'g');
    await instanceA.increment('live', 60_000, 5, 60_000, 'g');
    await instanceA.increment('blocked', 60_000, 0, 3_600_000, 'g');
    // «ended» (2 hits): its window is over. «blocked»: its window is over, its block is not.
    await prismaA.$executeRaw`
      UPDATE "RateLimitCounter" SET "windowEndsAt" = now() - interval '1 second'
      WHERE "hits" = 2 OR "blockedUntil" IS NOT NULL`;
    const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
    await boss.start();
    try {
      const queue = new PgBossQueue(boss);
      await new MaintenanceSweepHandler(
        prismaA,
        new ContentDeletion(new AuditService(), queue),
        queue,
        {
          WORKER_PURGE_BATCH_SIZE: 500,
          GUEST_SESSION_IDLE_DAYS: 400,
          REPORT_EMAIL_RETENTION_DAYS: 90,
          AUTH_TOKEN_RETENTION_DAYS: 30,
        },
      ).handle();
    } finally {
      await boss.stop();
    }
    const left = await prismaA.rateLimitCounter.findMany({
      select: { hits: true, blockedUntil: true },
    });
    expect(left).toHaveLength(2);
    expect(left.some((row) => row.hits === 2)).toBe(false);
  });
});
