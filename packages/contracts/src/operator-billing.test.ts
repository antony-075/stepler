import { describe, expect, test } from 'vitest';
import {
  grantCreateSchema,
  operatorBillingAccountQuerySchema,
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

test('priceSetSchema takes money for one slot', () => {
  const body = { interval: 'MONTH', amountMinor: 49900, currency: 'UAH' };
  expect(priceSetSchema.parse(body)).toEqual(body);
  expect(priceSetSchema.safeParse({ ...body, amountMinor: 0 }).success).toBe(false);
});

test('the account lookup takes one e-mail', () => {
  expect(operatorBillingAccountQuerySchema.parse({ email: 'olena@example.com' })).toEqual({
    email: 'olena@example.com',
  });
  expect(operatorBillingAccountQuerySchema.safeParse({ email: 'olena' }).success).toBe(false);
});
