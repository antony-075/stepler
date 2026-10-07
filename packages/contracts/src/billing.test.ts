import { describe, expect, test } from 'vitest';
import { accessSchema, checkoutRequestSchema, ERROR_CODES, moneySchema } from './index.js';

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
  expect(ERROR_CODES.slice(-10)).toEqual([
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
  ]);
});
