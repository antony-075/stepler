import type { ProviderOutcome } from '../provider/payment-provider.js';

const FINAL: Readonly<Record<string, ProviderOutcome>> = {
  success: 'SUCCEEDED',
  failure: 'FAILED',
  error: 'FAILED',
  reversed: 'REVERSED',
  subscribed: 'SUBSCRIBED',
  unsubscribed: 'UNSUBSCRIBED',
};

/** Documented non-final statuses (status API page, 2026-10-07): the payment is still open. */
const PENDING = new Set([
  'processing',
  'prepared',
  'wait_accept',
  'wait_secure',
  'wait_card',
  'wait_reserve',
  'wait_compensation',
  'wait_lc',
  'wait_qr',
  'wait_sender',
  'cash_wait',
  'hold_wait',
  'invoice_wait',
  'try_again',
]);

/**
 * LiqPay's `status` in our terms. `*_verify` statuses wait for the payer; an unknown value is
 * treated as pending (never as paid) and reported so the mapping can be extended.
 */
export function mapLiqPayStatus(raw: string): { outcome: ProviderOutcome; known: boolean } {
  const final = FINAL[raw];
  if (final !== undefined) return { outcome: final, known: true };
  if (PENDING.has(raw) || raw.endsWith('_verify')) return { outcome: 'PENDING', known: true };
  return { outcome: 'PENDING', known: false };
}
