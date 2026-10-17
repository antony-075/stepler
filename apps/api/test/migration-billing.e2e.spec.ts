import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestPrisma, resetDatabase } from './support/database.js';

// The billing entitlements migration's rules (ADR 0018, plan Task 3), against the real schema.

const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

/** Runs `sql` and returns the violated constraint's name, or `null` when it succeeded. */
async function violation(sql: string, ...values: unknown[]): Promise<string | null> {
  try {
    await prisma.$executeRawUnsafe(sql, ...values);
    return null;
  } catch (error) {
    const text = String((error as Error).message);
    return /"([A-Za-z_]+)"/.exec(text.slice(text.indexOf('constraint')))?.[1] ?? text;
  }
}

const offerId = async (code: string) =>
  (await prisma.billingOffer.findUniqueOrThrow({ where: { code } })).id;

const insertOffer = (code: string, columns: string, values: string) =>
  violation(
    `INSERT INTO "BillingOffer" ("code", "titleUk", "titleEn", "updatedAt", ${columns})
     VALUES ('${code}', 'Т', 'T', now(), ${values})`,
  );

const insertGrant = (userId: string, offer: string, extra = '', extraValues = '') =>
  violation(
    `INSERT INTO "Subscription" ("userId", "source", "status", "offerId", "activeCollections",
       "storageBytes", "collectionStorageBytes", "guestLinks", "grantReason", "grantedByUserId",
       "updatedAt"${extra})
     VALUES ($1::uuid, 'COMPLIMENTARY', 'ACTIVE', $2::uuid, 1, 1, 1, 1, 'Тест', $1::uuid,
       now()${extraValues})`,
    userId,
    offer,
  );

describe('billing entitlements migration', () => {
  test('seeds the draft offers; only the trial is live', async () => {
    const offers = await prisma.billingOffer.findMany({ orderBy: { code: 'asc' } });
    expect(offers.map((offer) => [offer.code, offer.kind, offer.active])).toEqual([
      ['ext-retention-365', 'PACK_EXTENSION', false],
      ['ext-storage', 'PACK_EXTENSION', false],
      ['ext-window-30', 'PACK_EXTENSION', false],
      ['pack-event', 'PACK', false],
      ['pack-start', 'PACK', false],
      ['sub-business', 'SUBSCRIPTION', false],
      ['sub-pro', 'SUBSCRIPTION', false],
      ['trial', 'TRIAL', true],
    ]);
    expect(offers.find((offer) => offer.code === 'trial')).toMatchObject({
      durationDays: 7,
      activeCollections: 1,
      storageBytes: 1024n ** 3n,
      collectionStorageBytes: 1024n ** 3n,
      guestLinks: 10,
    });
    expect(await prisma.billingPrice.count()).toBe(0);
  });

  test('gives an existing account a fresh 7-day trial', async () => {
    const user = await prisma.user.create({ data: { email: 'olena@example.com' } });
    const dir = new URL('../prisma/migrations/', import.meta.url);
    const folder = readdirSync(dir).find((name) => name.endsWith('_billing_entitlements'));
    const sql = readFileSync(new URL(`${folder}/migration.sql`, dir), 'utf8');
    const backfill = /^UPDATE "User" SET "trialEndsAt".*;$/m.exec(sql)?.[0];
    expect(backfill).toBeDefined();
    await prisma.$executeRawUnsafe(backfill ?? '');
    const { trialEndsAt } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const expected = Date.now() + 7 * 24 * 3600_000;
    expect(Math.abs((trialEndsAt?.getTime() ?? 0) - expected)).toBeLessThan(60_000);
  });

  test('prices are positive, one live per offer, period and currency', async () => {
    const pack = await offerId('pack-start');
    const price = (amount: number, active = true) =>
      violation(
        `INSERT INTO "BillingPrice" ("offerId", "interval", "currency", "amountMinor", "active")
         VALUES ($1::uuid, 'ONE_TIME', 'UAH', ${amount}, ${active})`,
        pack,
      );
    expect(await price(0)).toBe('BillingPrice_amount_positive');
    expect(await price(49900)).toBeNull();
    expect(await price(59900)).toBe('BillingPrice_one_active_per_slot');
    expect(await price(59900, false)).toBeNull();
  });

  test('an offer has the limits its kind needs', async () => {
    expect(
      await insertOffer('t2', '"kind", "activeCollections", "storageBytes"', `'TRIAL', 1, 1`),
    ).toBe('BillingOffer_kind_shape');
    expect(
      await insertOffer(
        'p2',
        '"kind", "collectionStorageBytes", "guestLinks", "windowDays", "retentionDays", "activeCollections"',
        `'PACK', 1, 1, 30, 365, 5`,
      ),
    ).toBe('BillingOffer_kind_shape');
    expect(await insertOffer('x2', '"kind"', `'PACK_EXTENSION'`)).toBe('BillingOffer_kind_shape');
    expect(await insertOffer('s2', '"kind", "activeCollections"', `'SUBSCRIPTION', 5`)).toBe(
      'BillingOffer_kind_shape',
    );
    expect(await insertOffer('Bad Code', '"kind", "extension"', `'PACK_EXTENSION', 'WINDOW'`)).toBe(
      'BillingOffer_code_format',
    );
  });

  test('a paid subscription needs its price snapshot and consent', async () => {
    const user = await prisma.user.create({ data: { email: 'olena@example.com' } });
    expect(
      await violation(
        `INSERT INTO "Subscription" ("userId", "source", "status", "offerId", "activeCollections",
           "storageBytes", "collectionStorageBytes", "guestLinks", "updatedAt")
         VALUES ($1::uuid, 'LIQPAY', 'ACTIVE', $2::uuid, 5, 1, 1, 1, now())`,
        user.id,
        await offerId('sub-pro'),
      ),
    ).toBe('Subscription_liqpay_shape');
  });

  test('periods run forward', async () => {
    const user = await prisma.user.create({ data: { email: 'olena@example.com' } });
    expect(
      await insertGrant(
        user.id,
        await offerId('sub-pro'),
        ', "currentPeriodStart", "currentPeriodEnd"',
        ", now(), now() - interval '1 day'",
      ),
    ).toBe('Subscription_period_order');
  });

  test('one live plan per account; ended ones stay as history', async () => {
    const user = await prisma.user.create({ data: { email: 'olena@example.com' } });
    const pro = await offerId('sub-pro');
    expect(await insertGrant(user.id, pro)).toBeNull();
    expect(await insertGrant(user.id, pro)).toBe('Subscription_one_live_per_user');
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { status: 'EXPIRED', endedAt: new Date() },
    });
    expect(await insertGrant(user.id, pro)).toBeNull();
  });

  test('a pack runs its clocks in order and goes with its collection', async () => {
    const owner = await prisma.user.create({ data: { email: 'olena@example.com' } });
    const collection = await prisma.collection.create({
      data: { ownerId: owner.id, title: 'Весілля' },
    });
    const pack = await offerId('pack-start');
    expect(
      await violation(
        `INSERT INTO "CollectionPack" ("collectionId", "offerId", "storageBytes", "guestLinks",
           "activatedAt", "windowEndsAt", "retentionEndsAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, 1, 1, now(), now() + interval '30 days', now(), now())`,
        collection.id,
        pack,
      ),
    ).toBe('CollectionPack_clock_order');
    await prisma.collectionPack.create({
      data: {
        collectionId: collection.id,
        offerId: pack,
        storageBytes: 1n,
        guestLinks: 1,
        activatedAt: new Date(),
        windowEndsAt: new Date(Date.now() + 1000),
        retentionEndsAt: new Date(Date.now() + 2000),
      },
    });
    await prisma.collection.delete({ where: { id: collection.id } });
    expect(await prisma.collectionPack.count()).toBe(0);
  });

  test('an offer in use cannot be deleted', async () => {
    const pack = await offerId('pack-start');
    await prisma.billingPrice.create({
      data: { offerId: pack, interval: 'ONE_TIME', currency: 'UAH', amountMinor: 49900 },
    });
    expect(await violation(`DELETE FROM "BillingOffer" WHERE "id" = $1::uuid`, pack)).toBe(
      'BillingPrice_offerId_fkey',
    );
  });

  test('a deletion warning needs a scheduled deletion', async () => {
    const owner = await prisma.user.create({ data: { email: 'olena@example.com' } });
    const collection = await prisma.collection.create({
      data: { ownerId: owner.id, title: 'Весілля' },
    });
    expect(
      await violation(
        `UPDATE "Collection" SET "deletionWarnedAt30" = now() WHERE "id" = $1::uuid`,
        collection.id,
      ),
    ).toBe('Collection_deletion_warnings');
    expect(
      await violation(
        `UPDATE "Collection" SET "deleteAfter" = now(), "deletionWarnedAt30" = now() WHERE "id" = $1::uuid`,
        collection.id,
      ),
    ).toBeNull();
  });
});
