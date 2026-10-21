import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_PLAN_PRICES, E2E_PRICES } from './billing-env.js';
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

/**
 * The packs and plans on sale in the journeys (ADR 0018): UAH prices (`E2E_PRICES`,
 * `E2E_PLAN_PRICES`), offers activated.
 * Prices are rewritten on every run so a changed price list takes effect.
 */
const SOLD = `'pack-start','pack-event','ext-window-30','ext-retention-365','sub-pro','sub-business'`;
const PLAN_ROWS = Object.entries(E2E_PLAN_PRICES)
  .flatMap(([code, prices]) =>
    Object.entries(prices).map(([interval, amount]) => `('${code}', '${interval}', ${amount})`),
  )
  .join(', ');
const E2E_CATALOGUE = `DELETE FROM "BillingPrice" WHERE "offerId" IN (SELECT id FROM "BillingOffer"
  WHERE code IN (${SOLD}))
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."priceId" = "BillingPrice".id);
UPDATE "BillingPrice" SET active = false WHERE "offerId" IN (SELECT id FROM "BillingOffer"
  WHERE code IN (${SOLD}));
INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor")
  SELECT o.id, 'ONE_TIME', 'UAH', v.amount FROM "BillingOffer" o JOIN (VALUES
  ${Object.entries(E2E_PRICES)
    .map(([code, amount]) => `('${code}', ${amount})`)
    .join(', ')}) AS v(code, amount) ON v.code = o.code;
INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor")
  SELECT o.id, v.interval::"BillingInterval", 'UAH', v.amount FROM "BillingOffer" o
  JOIN (VALUES ${PLAN_ROWS}) AS v(code, interval, amount) ON v.code = o.code;
UPDATE "BillingOffer" SET active = true WHERE code IN (${SOLD});`;

/** Migrates the e2e database and empties it, so every run starts clean (rate-limit windows too). */
export default function globalSetup(): void {
  prisma(['migrate', 'deploy']);
  prisma(
    ['db', 'execute', '--stdin'],
    `TRUNCATE "User", "AuthAccount", "AuthSession", "AuthEmailToken", "PasswordCredential", "RateLimitCounter" RESTART IDENTITY CASCADE;\n${E2E_TRIAL_LIMITS}\n${E2E_CATALOGUE}`,
  );
}
