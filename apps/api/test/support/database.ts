import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_DATABASE_URL } from './env.js';

/** A client for test setup and assertions, separate from the application's PrismaService. */
export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

const MODEL_TABLES = Object.values(Prisma.ModelName)
  .map((name) => `"${name}"`)
  .join(', ');

/**
 * Empties every model table (not `_prisma_migrations`) in one statement (spike S6: ~5 ms), and
 * pg-boss's jobs once an app has installed its schema (queues and schedules stay).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${MODEL_TABLES} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN IF to_regclass('pgboss.job') IS NOT NULL THEN DELETE FROM pgboss.job; END IF; END $$`,
  );
}

export interface QueuedJob {
  id: string;
  name: string;
  data: unknown;
  singletonKey: string | null;
  startAfter: Date;
  createdOn: Date;
}

/** Jobs waiting to run (pg-boss `created` or `retry` state), oldest first. */
export async function queuedJobs(prisma: PrismaClient, name?: string): Promise<QueuedJob[]> {
  return prisma.$queryRawUnsafe<QueuedJob[]>(
    `SELECT id::text, name, data, singleton_key AS "singletonKey", start_after AS "startAfter",
            created_on AS "createdOn"
       FROM pgboss.job
      WHERE state IN ('created', 'retry') AND ($1::text IS NULL OR name = $1)
      ORDER BY created_on, id`,
    name ?? null,
  );
}
