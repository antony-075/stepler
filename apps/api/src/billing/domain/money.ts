/**
 * The only conversions between our integer minor units and a provider's decimal amount (plan
 * "Money"). Never `* 100` on a float: the decimal is handled as text.
 */

function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError('amountMinor must be a positive safe integer');
  }
}

/** `734 → "7.34"`, `100 → "1.00"`. */
export function formatMinor(amountMinor: number): string {
  assertMinor(amountMinor);
  const text = String(amountMinor).padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

const DECIMAL = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * A provider's amount (`7.34`, `"7.3"`) in minor units. Throws on more than two decimals (a float
 * sum such as `0.1 + 0.2` included), exponent notation, or anything not positive: the caller
 * treats that as an amount mismatch, never as a grant.
 */
export function parseAmountToMinor(value: number | string): number {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  const match = DECIMAL.exec(text);
  if (!match) throw new RangeError('Not a decimal amount with at most two decimals');
  const [, whole = '0', fraction = ''] = match;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  assertMinor(minor);
  return minor;
}
