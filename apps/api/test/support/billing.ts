import { encodeData, liqpaySign } from '../../src/billing/liqpay/liqpay-signature.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

const GiB = 1024n ** 3n;
const DAY_MS = 24 * 3600_000;

export interface PlanLimits {
  activeCollections: number;
  storageBytes: bigint;
  collectionStorageBytes: bigint;
  guestLinks: number;
}

/**
 * The limits the API had before billing (env defaults until ADR 0018), so suites that are not
 * about entitlements keep their calibration: 3 active collections, 20 GiB per account, 10 GiB per
 * collection, 10 additional guest links.
 */
export const TEST_PLAN_LIMITS: PlanLimits = {
  activeCollections: 3,
  storageBytes: 20n * GiB,
  collectionStorageBytes: 10n * GiB,
  guestLinks: 10,
};

let planDefaults: PlanLimits = TEST_PLAN_LIMITS;

/**
 * Changes the limits `grantTestPlan` (and so `signInAs` and `seedCollection`) gives new accounts,
 * for a suite about quotas; call it with nothing to restore `TEST_PLAN_LIMITS`. Before billing
 * these suites set the `LIMIT_*` environment variables.
 */
export function useTestPlanLimits(limits: Partial<PlanLimits> = {}): void {
  planDefaults = { ...TEST_PLAN_LIMITS, ...limits };
}

/**
 * Gives the account a live complimentary plan with these limits (a test fixture, written as the
 * operator's grant is: `source = COMPLIMENTARY`, the seeded «Business» offer, no end). Replaces
 * a live plan the account already has.
 */
export async function grantTestPlan(
  prisma: PrismaClient,
  userId: string,
  limits: Partial<PlanLimits> = {},
): Promise<void> {
  const offer = await prisma.billingOffer.findUniqueOrThrow({ where: { code: 'sub-business' } });
  const now = new Date();
  await prisma.subscription.updateMany({
    where: { userId, status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] } },
    data: { status: 'EXPIRED', endedAt: now },
  });
  await prisma.subscription.create({
    data: {
      userId,
      source: 'COMPLIMENTARY',
      status: 'ACTIVE',
      offerId: offer.id,
      ...planDefaults,
      ...limits,
      currentPeriodStart: now,
      grantReason: 'Test fixture',
      grantedByUserId: userId,
    },
  });
}

/** Sets the account's trial end; a date in the past ends the trial now. */
export async function setTrialEnd(prisma: PrismaClient, userId: string, endsAt: Date | null) {
  await prisma.user.update({ where: { id: userId }, data: { trialEndsAt: endsAt } });
}

/** A new account's trial, as sign-up sets it. */
export const freshTrialEnd = (): Date => new Date(Date.now() + 7 * DAY_MS);

/** Ends the account's trial and every plan: the account becomes read-only (`TRIAL_ENDED`). */
export async function endAllAccess(prisma: PrismaClient, userId: string): Promise<void> {
  const past = new Date(Date.now() - DAY_MS);
  await prisma.subscription.updateMany({
    where: { userId, status: { not: 'EXPIRED' } },
    data: { status: 'EXPIRED', endedAt: new Date(past.getTime() - DAY_MS) },
  });
  await setTrialEnd(prisma, userId, past);
}

/**
 * Turns a collection into a pack collection with these clocks (M2 sells packs; until then a
 * fixture writes the row as a paid checkout will).
 */
export async function givePack(
  prisma: PrismaClient,
  collectionId: string,
  clocks: { windowEndsAt: Date; retentionEndsAt: Date; storageBytes?: bigint; guestLinks?: number },
): Promise<void> {
  const offer = await prisma.billingOffer.findUniqueOrThrow({ where: { code: 'pack-start' } });
  const activatedAt = new Date(Math.min(Date.now(), clocks.windowEndsAt.getTime()) - 30 * DAY_MS);
  await prisma.collectionPack.create({
    data: {
      collectionId,
      offerId: offer.id,
      storageBytes: clocks.storageBytes ?? 10n * GiB,
      guestLinks: clocks.guestLinks ?? 10,
      activatedAt,
      windowEndsAt: clocks.windowEndsAt,
      retentionEndsAt: clocks.retentionEndsAt,
    },
  });
  await prisma.collection.update({ where: { id: collectionId }, data: { entitlement: 'PACK' } });
}

/** A sandbox-shaped key pair for tests only; never a real key. */
export const TEST_LIQPAY = {
  publicKey: 'sandbox_i00000000test',
  privateKey: 'sandbox_test-private-key-for-integration-tests',
} as const;

/** The API env that switches payments on with the test keys (and an optional stub base). */
export function liqpayEnv(apiBase?: string): Record<string, string> {
  return {
    BILLING_PROVIDER: 'liqpay',
    LIQPAY_PUBLIC_KEY: TEST_LIQPAY.publicKey,
    LIQPAY_PRIVATE_KEY: TEST_LIQPAY.privateKey,
    ...(apiBase === undefined ? {} : { LIQPAY_API_BASE: apiBase }),
  };
}

/** Draft UAH prices for tests (kopecks), as the operator would set them. */
export const TEST_PRICES = {
  'pack-start': 50_000,
  'pack-event': 120_000,
  'ext-window-30': 15_000,
  'ext-retention-365': 30_000,
} as const;

export type PricedCode = keyof typeof TEST_PRICES;

/** Prices and activates the pack offers; returns each offer's id and its live price id. */
export async function priceCatalogue(
  prisma: PrismaClient,
): Promise<Record<PricedCode, { offerId: string; priceId: string }>> {
  const out = {} as Record<PricedCode, { offerId: string; priceId: string }>;
  for (const [code, amountMinor] of Object.entries(TEST_PRICES) as [PricedCode, number][]) {
    const offer = await prisma.billingOffer.update({ where: { code }, data: { active: true } });
    const price = await prisma.billingPrice.create({
      data: { offerId: offer.id, interval: 'ONE_TIME', currency: 'UAH', amountMinor },
    });
    out[code] = { offerId: offer.id, priceId: price.id };
  }
  return out;
}

/** A LiqPay callback body (`data` + `signature`) signed with the test key, as LiqPay posts it. */
export function signedCallback(
  fields: Record<string, unknown>,
  key: string = TEST_LIQPAY.privateKey,
): { data: string; signature: string } {
  const data = encodeData(fields);
  return { data, signature: liqpaySign(key, data) };
}

/** The fields of a LiqPay `pay` callback for one of our payments (amount as LiqPay's decimal). */
export function payFields(
  payment: { id: string; amountMinor: number; currency: string },
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: 'pay',
    status,
    version: 7,
    order_id: payment.id,
    liqpay_order_id: `LQ${payment.id.slice(0, 8)}`,
    payment_id: Number.parseInt(payment.id.replace(/-/g, '').slice(-10), 16),
    amount: payment.amountMinor / 100,
    currency: payment.currency,
    end_date: Date.now(),
    sender_first_name: 'Олена',
    sender_card_mask2: '424242*42',
    ...extra,
  };
}
