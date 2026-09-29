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

/** Empties every model table (not `_prisma_migrations`) in one statement (spike S6: ~5 ms). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${MODEL_TABLES} RESTART IDENTITY CASCADE`);
}
