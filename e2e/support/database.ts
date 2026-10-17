import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL } from './env.js';

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** Runs one SQL script against the e2e database through the Prisma CLI (URL via env, never argv). */
function execute(sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    input: sql,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

/**
 * Turns an account into one from before the sign-in checkbox (ADR 0016): no acceptance rows. The
 * UI cannot produce such an account any more; the fallback page exists for them.
 */
export function dropLegalAcceptances(email: string): void {
  if (!/^[a-z0-9@.-]+$/.test(email)) throw new Error('unexpected e-mail format');
  execute(
    `DELETE FROM "LegalAcceptance" WHERE "userId" IN (SELECT id FROM "User" WHERE email = '${email}');`,
  );
}

const safeEmail = (email: string): string => {
  if (!/^[a-z0-9@.-]+$/.test(email)) throw new Error('unexpected e-mail format');
  return email;
};

/**
 * Ends the account's trial a day ago (ADR 0018): what seven days of waiting would do. Plans and
 * grants are left as they are.
 */
export function endTrial(email: string): void {
  execute(
    `UPDATE "User" SET "trialEndsAt" = now() - interval '1 day' WHERE email = '${safeEmail(email)}';`,
  );
}

const safeId = (id: string): string => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('unexpected id format');
  return id;
};

/** Ends a pack collection's collecting window a day ago (what 30 days of waiting would do). */
export function endPackWindow(collectionId: string): void {
  execute(
    `UPDATE "CollectionPack" SET "windowEndsAt" = now() - interval '1 day', "activatedAt" = LEAST("activatedAt", now() - interval '2 days') WHERE "collectionId" = '${safeId(collectionId)}';`,
  );
}

/**
 * What the reconcile job does at the period end of a monthly ↔ yearly switch (B14): the old
 * LiqPay subscription stopped, the period over, grace for four days. The plan must have a
 * scheduled switch.
 */
export function stopPlanForSwitch(email: string): void {
  execute(
    `UPDATE "Subscription" SET "providerUnsubscribedAt" = now(), "status" = 'PAST_DUE', "currentPeriodStart" = now() - interval '1 month', "currentPeriodEnd" = now() - interval '2 hours', "graceEndsAt" = now() + interval '4 days' - interval '2 hours' WHERE "status" = 'ACTIVE' AND "pendingPriceId" IS NOT NULL AND "userId" IN (SELECT id FROM "User" WHERE email = '${safeEmail(email)}');`,
  );
}

/** A renewal LiqPay could not charge (grace until four days after the period end). */
export function failRenewal(email: string): void {
  execute(
    `UPDATE "Subscription" SET "status" = 'PAST_DUE', "currentPeriodStart" = now() - interval '1 month', "currentPeriodEnd" = now() - interval '2 hours', "graceEndsAt" = now() + interval '4 days' - interval '2 hours' WHERE "status" = 'ACTIVE' AND "source" = 'LIQPAY' AND "userId" IN (SELECT id FROM "User" WHERE email = '${safeEmail(email)}');`,
  );
}

/**
 * The grace after a missed renewal is over (the account is read-only from the period end). The
 * trial ended before the plan did, so the plan's end is what the account shows.
 */
export function endGrace(email: string): void {
  execute(
    `UPDATE "User" SET "trialEndsAt" = now() - interval '40 days' WHERE email = '${safeEmail(email)}';`,
  );
  execute(
    `UPDATE "Subscription" SET "currentPeriodEnd" = now() - interval '5 days', "currentPeriodStart" = now() - interval '35 days', "graceEndsAt" = now() - interval '1 day' WHERE "status" = 'PAST_DUE' AND "userId" IN (SELECT id FROM "User" WHERE email = '${safeEmail(email)}');`,
  );
}

/** Half of the paid month has passed (an upgrade is then prorated for the other half). */
export function halfPeriodPassed(email: string): void {
  execute(
    `UPDATE "Subscription" SET "currentPeriodStart" = now() - interval '15 days', "currentPeriodEnd" = now() - interval '15 days' + interval '1 month' WHERE "status" = 'ACTIVE' AND "source" = 'LIQPAY' AND "userId" IN (SELECT id FROM "User" WHERE email = '${safeEmail(email)}');`,
  );
}
