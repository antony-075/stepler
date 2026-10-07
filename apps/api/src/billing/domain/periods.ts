/**
 * Billing time arithmetic, all in UTC (plan "Time"). Calendar months and years clamp the day
 * (`Jan 31 + 1 month = Feb 28/29`); no other module does `Date` math for billing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type CalendarInterval = 'MONTH' | 'YEAR';

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** `count` calendar months or years after `start`, counted from `start` (no drift). */
export function addInterval(start: Date, interval: CalendarInterval, count = 1): Date {
  const months = interval === 'YEAR' ? count * 12 : count;
  const total = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(year, month));
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

/** `days` × 24 hours after `start`. */
export function addDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

/**
 * The one boundary rule (Review Focus 4): a source is active while `now < end`; `null` = no end.
 */
export function isActiveAt(now: Date, end: Date | null): boolean {
  return end === null || now.getTime() < end.getTime();
}

export function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
