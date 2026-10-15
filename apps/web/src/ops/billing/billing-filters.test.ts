import { expect, test } from 'vitest';
import { paymentFiltersOf, subscriptionFiltersOf } from './billing-filters';

test('payment filters keep known values only', () => {
  expect(
    paymentFiltersOf({ status: 'REFUNDED', email: ' a@b.c ', needsReview: 'true', mismatch: '1' }),
  ).toEqual({ status: 'REFUNDED', email: 'a@b.c', needsReview: 'true' });
  expect(paymentFiltersOf({ status: 'NOPE', email: ['x', 'y'] })).toEqual({});
});

test('subscription filters keep known values only', () => {
  expect(
    subscriptionFiltersOf({ status: 'PAST_DUE', source: 'LIQPAY', needsCheck: 'true' }),
  ).toEqual({ status: 'PAST_DUE', source: 'LIQPAY', needsCheck: 'true' });
  expect(subscriptionFiltersOf({ source: 'BANK' })).toEqual({});
});
