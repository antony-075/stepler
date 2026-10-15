import { execFileSync } from 'node:child_process';
import { createTestPrisma, SEED_COPY } from './database.js';
import { TEST_DATABASE_URL } from './env.js';

/**
 * Applies migrations to the test database once per integration run, then keeps a copy of the
 * seeded offer catalogue (once, while it is as the migration seeded it) for `resetDatabase` to
 * restore: the /ops editor tests change offers (plan Task 20).
 */
export default async function setup(): Promise<void> {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const prisma = createTestPrisma();
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${SEED_COPY}" AS SELECT * FROM "BillingOffer"`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
