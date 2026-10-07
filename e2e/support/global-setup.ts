import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL } from './env.js';

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** Runs the Prisma CLI against the e2e database. The URL goes through env, never argv. */
function prisma(args: string[], input?: string): void {
  try {
    execFileSync('pnpm', ['exec', 'prisma', ...args], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'],
    });
  } catch {
    // The child's error message would repeat its environment-dependent output; keep it generic.
    throw new Error(`e2e setup failed: prisma ${args.join(' ')} (is docker compose up?)`);
  }
}

/**
 * The journeys sign up through the real flow, so every account is on the trial (ADR 0018).
 * Most journeys are not about billing and need more than its 1 collection and 1 GiB: the e2e
 * catalogue gives the trial the limits the app had before billing (3 collections, 20 GiB, 10 GiB
 * per collection). `billing.spec.ts` covers what the trial's end does; the API tests cover its
 * real limits.
 */
const E2E_TRIAL_LIMITS = `UPDATE "BillingOffer" SET "activeCollections" = 3,
  "storageBytes" = 21474836480, "collectionStorageBytes" = 10737418240 WHERE "code" = 'trial';`;

/** Migrates the e2e database and empties it, so every run starts clean. */
export default function globalSetup(): void {
  prisma(['migrate', 'deploy']);
  prisma(
    ['db', 'execute', '--stdin'],
    `TRUNCATE "User", "AuthAccount", "AuthSession", "MagicLinkToken" RESTART IDENTITY CASCADE;\n${E2E_TRIAL_LIMITS}`,
  );
}
