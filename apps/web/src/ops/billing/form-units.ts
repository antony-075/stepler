/**
 * The /ops editor's two conversions (plan Tasks 20–21): prices typed in hryvnias with up to two
 * decimals become integer kopecks, and plan storage typed in GB (binary, as sold: 1 ГБ = 1 GiB)
 * becomes a byte count string. No float arithmetic on money: the text is split, never multiplied.
 */

const MONEY = /^(\d{1,8})(?:[.,](\d{1,2}))?$/;

/** «499», «499,5», «1 499,00» or «499.00» → 49900; anything else (or zero) → `null`. */
export function parseMoneyInput(text: string): number | null {
  const match = MONEY.exec(text.replace(/\s/g, ''));
  if (match === null) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + fraction;
  return minor > 0 ? minor : null;
}

/** 49900 → «499,00» (the field's own format, no grouping, so it parses back). */
export function formatMoneyInput(minor: number): string {
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, '0');
  return `${String(whole)},${fraction}`;
}

const GIB = 1024n ** 3n;
const GB = /^(\d{1,7})(?:[.,](\d))?$/;

/** «10» or «0,5» GB → the byte count as the contract's decimal string; else `null`. */
export function parseGbInput(text: string): string | null {
  const match = GB.exec(text.trim());
  if (match === null) return null;
  const tenths = BigInt(match[1] ?? '0') * 10n + BigInt(match[2] ?? '0');
  return ((tenths * GIB) / 10n).toString();
}

/** A byte count string → GB for the field («10», «0,5»), rounded to a tenth. */
export function formatGbInput(bytes: string | null): string {
  if (bytes === null) return '';
  const tenths = (BigInt(bytes) * 10n + GIB / 2n) / GIB;
  const whole = tenths / 10n;
  const rest = tenths % 10n;
  return rest === 0n ? whole.toString() : `${whole.toString()},${rest.toString()}`;
}
