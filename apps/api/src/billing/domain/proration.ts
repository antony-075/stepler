/**
 * An upgrade's one-time charge for the rest of the period [P10]:
 * `ceil((new − old) × secondsLeft / periodSeconds)` in minor units, integer math only. A charge
 * below `minChargeMinor` is waived (the upgrade applies at once, nothing is charged).
 */
export function prorate(input: {
  oldPriceMinor: number;
  newPriceMinor: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
  minChargeMinor: number;
}): { chargeMinor: number; waived: boolean } {
  const { oldPriceMinor, newPriceMinor, periodStart, periodEnd, now, minChargeMinor } = input;
  if (newPriceMinor <= oldPriceMinor) throw new RangeError('Not an upgrade');
  const periodMs = BigInt(periodEnd.getTime() - periodStart.getTime());
  if (periodMs <= 0n) throw new RangeError('Empty period');
  const leftMs = BigInt(Math.max(0, periodEnd.getTime() - now.getTime()));
  const clampedLeft = leftMs > periodMs ? periodMs : leftMs;
  const product = BigInt(newPriceMinor - oldPriceMinor) * clampedLeft;
  const charge = Number((product + periodMs - 1n) / periodMs);
  return { chargeMinor: charge, waived: charge < minChargeMinor || charge === 0 };
}
