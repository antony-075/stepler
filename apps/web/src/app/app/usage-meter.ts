/** The smallest fill a usage meter shows once anything is used, so "a little" never reads as none. */
export const MIN_USED_PERCENT = 3;

/**
 * A usage meter's fill in percent: nothing for nothing used, at least `MIN_USED_PERCENT` for any
 * use (21 MB of 21 GB), at most 100. The numbers next to the meter stay exact.
 */
export function meterPercent(used: number, limit: number): number {
  if (!(used > 0)) return 0;
  if (!(limit > 0)) return 100;
  return Math.min(100, Math.max(MIN_USED_PERCENT, Math.round((used / limit) * 100)));
}
