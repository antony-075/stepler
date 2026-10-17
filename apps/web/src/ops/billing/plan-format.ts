/**
 * Pure helpers of the billing section (ADR 0018). Plan storage is sold in binary units («1 ГБ»
 * = 1 GiB, «1 ТБ» = 1 TiB), so it is shown that way, not with the user app's decimal sizes.
 */

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

type UnitFormatter = (
  value: number,
  options: { style: 'unit'; unit: string; maximumFractionDigits?: number },
) => string;

/** `bytes` is the contract's decimal string; `format` is next-intl's `useFormatter().number`. */
export function formatPlanBytes(format: UnitFormatter, bytes: string): string {
  const value = Number(bytes);
  if (value >= TIB) {
    return format(value / TIB, { style: 'unit', unit: 'terabyte', maximumFractionDigits: 1 });
  }
  return format(value / GIB, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 1 });
}

/** The instant a calendar day (`YYYY-MM-DD`) ends in Kyiv: the next day's 00:00 there, as UTC. */
export function endOfKyivDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const nextMidnightUtc = Date.UTC(y, m - 1, d + 1);
  if (Number.isNaN(nextMidnightUtc)) return null;
  // Kyiv's offset at that moment (+02:00 or +03:00), read from Intl, not hard-coded.
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(nextMidnightUtc))
    .find((part) => part.type === 'timeZoneName')?.value;
  const parsed = /GMT([+-])(\d{2}):(\d{2})/.exec(offset ?? '');
  const minutes =
    parsed === null
      ? 0
      : (parsed[1] === '-' ? -1 : 1) * (Number(parsed[2]) * 60 + Number(parsed[3]));
  return new Date(nextMidnightUtc - minutes * 60_000);
}

type CurrencyFormatter = (
  value: number,
  options: { style: 'currency'; currency: string },
) => string;

/** Integer minor units as money («1 200,00 ₴»); `format` is `useFormatter().number`. */
export function formatMinor(format: CurrencyFormatter, minor: number, currency: string): string {
  return format(minor / 100, { style: 'currency', currency });
}
