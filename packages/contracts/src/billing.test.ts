import { describe, expect, test } from 'vitest';
import {
  accessSchema,
  checkoutRequestSchema,
  collectionSchema,
  ERROR_CODES,
  guestContextSchema,
  moneySchema,
  usageResponseSchema,
} from './index.js';

const priceId = '0190f0a0-0000-7000-8000-000000000001';
const collectionId = '0190f0a0-0000-7000-8000-000000000002';

describe('moneySchema', () => {
  test('accepts integer minor units', () => {
    expect(moneySchema.parse({ amountMinor: 734, currency: 'UAH' })).toEqual({
      amountMinor: 734,
      currency: 'UAH',
    });
  });

  test.each([0, -1, 1.5])('rejects %s', (amountMinor) => {
    expect(moneySchema.safeParse({ amountMinor, currency: 'UAH' }).success).toBe(false);
  });

  test('rejects an unknown currency', () => {
    expect(moneySchema.safeParse({ amountMinor: 100, currency: 'GBP' }).success).toBe(false);
  });
});

describe('checkoutRequestSchema', () => {
  test('accepts a pack for an existing collection', () => {
    const body = { kind: 'PACK', priceId, collectionId };
    expect(checkoutRequestSchema.parse(body)).toEqual(body);
  });

  test('accepts a pack that creates a collection', () => {
    const body = { kind: 'PACK', priceId, collectionId: null, title: 'Весілля' };
    expect(checkoutRequestSchema.parse(body)).toEqual(body);
  });

  test.each(['amountMinor', 'currency', 'storageBytes', 'windowDays'])(
    'rejects a client-sent %s (the server prices it)',
    (field) => {
      const body = { kind: 'PACK', priceId, collectionId, [field]: 1 };
      expect(checkoutRequestSchema.safeParse(body).success).toBe(false);
    },
  );

  test('a new collection needs a title, an existing one must not have one', () => {
    expect(
      checkoutRequestSchema.safeParse({ kind: 'PACK', priceId, collectionId: null }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({ kind: 'PACK', priceId, collectionId, title: 'Весілля' })
        .success,
    ).toBe(false);
  });

  test('a subscription needs the auto-renewal consent', () => {
    const base = { kind: 'SUBSCRIPTION', priceId, termsVersion: 'v3' };
    expect(checkoutRequestSchema.safeParse({ ...base, autoRenewConsent: true }).success).toBe(true);
    expect(checkoutRequestSchema.safeParse({ ...base, autoRenewConsent: false }).success).toBe(
      false,
    );
    expect(checkoutRequestSchema.safeParse(base).success).toBe(false);
  });

  test('an extension names its collection', () => {
    expect(checkoutRequestSchema.safeParse({ kind: 'PACK_EXTENSION', priceId }).success).toBe(
      false,
    );
    expect(
      checkoutRequestSchema.safeParse({ kind: 'PACK_EXTENSION', priceId, collectionId }).success,
    ).toBe(true);
  });
});

describe('access in the existing responses', () => {
  const access = { state: 'READ_ONLY', reason: 'TRIAL_ENDED', endsAt: null };

  test('an access state names its reason', () => {
    expect(accessSchema.parse(access)).toEqual(access);
    expect(accessSchema.safeParse({ ...access, reason: 'EXPIRED' }).success).toBe(false);
  });
});

test('the billing error codes are appended', () => {
  expect(ERROR_CODES.slice(-11)).toEqual([
    'ACCOUNT_READ_ONLY',
    'COLLECTION_READ_ONLY',
    'COLLECTING_CLOSED',
    'OFFER_UNAVAILABLE',
    'PAYMENT_PENDING',
    'PLAN_DOWNGRADE_BLOCKED',
    'SUBSCRIPTION_EXISTS',
    'REFUND_EXCEEDS_PAID',
    'PAYMENT_PROVIDER_UNAVAILABLE',
    'BILLING_SIGNATURE_INVALID',
    // USD and EUR (ADR 0018 addendum 2026-10-16): a plan change stays in its currency.
    'CURRENCY_MISMATCH',
  ]);
});

describe('access in the existing responses', () => {
  const access = { state: 'READ_ONLY', reason: 'TRIAL_ENDED', endsAt: null } as const;

  test('usage carries the account access', () => {
    const usage = {
      activeCollections: { used: 1, limit: 1 },
      storage: { usedBytes: 0, limitBytes: 1024 },
      access,
    };
    expect(usageResponseSchema.parse(usage)).toEqual(usage);
    const withoutAccess = { activeCollections: usage.activeCollections, storage: usage.storage };
    expect(usageResponseSchema.safeParse(withoutAccess).success).toBe(false);
  });

  test('the guest context says whether guests may still contribute', () => {
    expect(guestContextSchema.shape.contribution.options).toEqual([
      'OPEN',
      'COLLECTING_CLOSED',
      'READ_ONLY',
    ]);
  });

  test('a collection carries its entitlement, access, pack and deletion date', () => {
    expect(Object.keys(collectionSchema.shape)).toEqual(
      expect.arrayContaining(['entitlement', 'access', 'pack', 'deleteAfter']),
    );
  });
});

describe('billing lists (M2)', () => {
  test('offers default to Ukrainian and refuse other keys', async () => {
    const { offerListQuerySchema } = await import('./index.js');
    expect(offerListQuerySchema.parse({})).toEqual({ locale: 'uk' });
    expect(offerListQuerySchema.safeParse({ locale: 'de' }).success).toBe(false);
    expect(offerListQuerySchema.safeParse({ admin: '1' }).success).toBe(false);
  });

  test('payments page by cursor with a bounded limit', async () => {
    const { accountPaymentListQuerySchema } = await import('./index.js');
    expect(accountPaymentListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(accountPaymentListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('subscriptions (plan Task 17)', () => {
  test('a plan change may answer without a payment; any other field is refused', async () => {
    const { checkoutResponseSchema, planChangePreviewSchema, subscriptionResumeSchema } =
      await import('./index.js');
    expect(
      checkoutResponseSchema.parse({ paymentId: null, status: 'SCHEDULED', form: null }).status,
    ).toBe('SCHEDULED');
    expect(subscriptionResumeSchema.safeParse({ termsVersion: 'v2' }).success).toBe(false);
    expect(
      subscriptionResumeSchema.safeParse({
        autoRenewConsent: true,
        termsVersion: 'v2',
        priceId: 'x',
      }).success,
    ).toBe(false);
    const preview = {
      kind: 'UPGRADE',
      chargeMinor: 35_000,
      waived: false,
      effective: 'NOW',
      effectiveAt: '2026-10-08T10:00:00.000Z',
      offerTitle: 'Business',
      interval: 'MONTH',
      price: { amountMinor: 120_000, currency: 'UAH' },
      blocked: null,
    };
    expect(planChangePreviewSchema.parse(preview)).toEqual(preview);
    expect(planChangePreviewSchema.safeParse({ ...preview, chargeMinor: -1 }).success).toBe(false);
    expect(planChangePreviewSchema.safeParse({ ...preview, chargeMinor: 1.5 }).success).toBe(false);
  });
});
