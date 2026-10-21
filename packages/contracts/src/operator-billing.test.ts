import { describe, expect, test } from 'vitest';
import {
  grantCreateSchema,
  offerCreateSchema,
  offerUpsertSchema,
  operatorBillingAccountQuerySchema,
  paymentListQuerySchema,
  priceSetSchema,
  refundCreateSchema,
} from './index.js';

const userId = '0190f0a0-0000-7000-8000-000000000001';
const offerId = '0190f0a0-0000-7000-8000-000000000002';

describe('grantCreateSchema', () => {
  const grant = { userId, offerId, endsAt: null, reason: 'Власник і тестувальники' };

  test('accepts an open-ended grant and one with an end', () => {
    expect(grantCreateSchema.parse(grant)).toEqual(grant);
    const dated = { ...grant, endsAt: '2027-01-01T00:00:00.000Z' };
    expect(grantCreateSchema.parse(dated)).toEqual(dated);
  });

  test('needs a reason of 1 to 500 characters', () => {
    expect(grantCreateSchema.safeParse({ ...grant, reason: '' }).success).toBe(false);
    expect(grantCreateSchema.safeParse({ ...grant, reason: 'x'.repeat(501) }).success).toBe(false);
  });

  test('rejects limits in the body (they come from the offer)', () => {
    expect(grantCreateSchema.safeParse({ ...grant, activeCollections: 100 }).success).toBe(false);
  });
});

describe('refundCreateSchema', () => {
  test.each([0, -5, 1.5])('rejects amountMinor %s', (amountMinor) => {
    expect(refundCreateSchema.safeParse({ amountMinor, reason: 'Подвійна оплата' }).success).toBe(
      false,
    );
  });

  test('accepts a partial refund with a reason', () => {
    const body = { amountMinor: 5000, reason: 'Подвійна оплата' };
    expect(refundCreateSchema.parse(body)).toEqual(body);
  });
});

test('priceSetSchema takes money for one slot and a reason', () => {
  const body = { interval: 'MONTH', amountMinor: 49900, currency: 'UAH', reason: 'Нова ціна' };
  expect(priceSetSchema.parse(body)).toEqual(body);
  expect(priceSetSchema.safeParse({ ...body, amountMinor: 0 }).success).toBe(false);
  expect(priceSetSchema.safeParse({ ...body, amountMinor: 1_000_000_001 }).success).toBe(false);
  const noReason: Partial<typeof body> = { ...body };
  delete noReason.reason;
  expect(priceSetSchema.safeParse(noReason).success).toBe(false);
});

describe('offerCreateSchema', () => {
  const offer = {
    code: 'pack-wedding',
    kind: 'PACK',
    extension: null,
    titleUk: 'Весілля',
    titleEn: 'Wedding',
    descriptionUk: null,
    descriptionEn: null,
    rank: 3,
    highlighted: true,
    ribbonUk: null,
    ribbonEn: null,
    activeCollections: null,
    storageBytes: '107374182400',
    collectionStorageBytes: null,
    guestLinks: 20,
    windowDays: 30,
    retentionDays: 365,
    durationDays: null,
    rroItemId: null,
    reason: 'Новий пакет',
  };

  test('accepts a pack with its limits', () => {
    expect(offerCreateSchema.parse(offer)).toEqual(offer);
  });

  test('never creates a trial and takes a code of lowercase letters, digits and hyphens', () => {
    expect(offerCreateSchema.safeParse({ ...offer, kind: 'TRIAL' }).success).toBe(false);
    expect(offerCreateSchema.safeParse({ ...offer, code: 'Pack Wedding' }).success).toBe(false);
  });

  test('the update body takes no code or kind', () => {
    const update: Partial<typeof offer> = { ...offer };
    delete update.code;
    delete update.kind;
    delete update.extension;
    expect(offerUpsertSchema.parse(update)).toEqual(update);
    expect(offerUpsertSchema.safeParse({ ...update, code: 'x1' }).success).toBe(false);
  });
});

test('payment list flags are the strings true and false', () => {
  expect(paymentListQuerySchema.parse({ needsReview: 'true' })).toEqual({
    needsReview: 'true',
    limit: 50,
  });
  expect(paymentListQuerySchema.safeParse({ mismatch: '1' }).success).toBe(false);
});

test('the account lookup takes one e-mail', () => {
  expect(operatorBillingAccountQuerySchema.parse({ email: 'olena@example.com' })).toEqual({
    email: 'olena@example.com',
  });
  expect(operatorBillingAccountQuerySchema.safeParse({ email: 'olena' }).success).toBe(false);
});
