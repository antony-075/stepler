import { describe, expect, test } from 'vitest';
import { AppError } from '../../errors/app-error.js';
import { LiqPayRroReceipts, NoFiscalReceipts } from './fiscal-receipts.js';

describe('fiscal receipts', () => {
  test('none adds nothing', () => {
    expect(new NoFiscalReceipts().rroInfo()).toBeUndefined();
  });

  test('liqpay_rro lists the offer’s registered item at the paid price', () => {
    expect(
      new LiqPayRroReceipts().rroInfo({ rroItemId: '1001' }, 49900, 'olena@example.com'),
    ).toEqual({
      items: [{ id: '1001', amount: 1, price: '499.00', cost: '499.00' }],
      delivery_emails: ['olena@example.com'],
    });
  });

  test('an offer without a registered item cannot be sold', () => {
    expect(() =>
      new LiqPayRroReceipts().rroInfo({ rroItemId: null }, 49900, 'olena@example.com'),
    ).toThrow(AppError);
  });
});
