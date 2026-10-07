import { describe, expect, test } from 'vitest';
import { mapLiqPayStatus } from './liqpay-status.js';

describe('mapLiqPayStatus', () => {
  test.each([
    ['success', 'SUCCEEDED'],
    ['failure', 'FAILED'],
    ['error', 'FAILED'],
    ['reversed', 'REVERSED'],
    ['subscribed', 'SUBSCRIBED'],
    ['unsubscribed', 'UNSUBSCRIBED'],
    ['3ds_verify', 'PENDING'],
    ['otp_verify', 'PENDING'],
    ['wait_secure', 'PENDING'],
    ['wait_accept', 'PENDING'],
    ['processing', 'PENDING'],
    ['prepared', 'PENDING'],
    ['cash_wait', 'PENDING'],
    ['hold_wait', 'PENDING'],
    ['invoice_wait', 'PENDING'],
    ['try_again', 'PENDING'],
  ] as const)('%s → %s', (raw, outcome) => {
    expect(mapLiqPayStatus(raw)).toEqual({ outcome, known: true });
  });

  test('an unknown value is pending and flagged for a warning', () => {
    expect(mapLiqPayStatus('sandbox')).toEqual({ outcome: 'PENDING', known: false });
  });
});
