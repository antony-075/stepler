import { describe, expect, test } from 'vitest';
import { prorate } from './proration.js';

const DAY = 24 * 60 * 60 * 1000;
const periodStart = new Date('2027-01-01T00:00:00Z');
const periodEnd = new Date(periodStart.getTime() + 30 * DAY);
const base = { oldPriceMinor: 50_000, newPriceMinor: 120_000, periodStart, periodEnd };

describe('prorate', () => {
  test('half the period left costs half the difference', () => {
    const now = new Date(periodStart.getTime() + 15 * DAY);
    expect(prorate({ ...base, now, minChargeMinor: 100 })).toEqual({
      chargeMinor: 35_000,
      waived: false,
    });
  });

  test('one second left rounds up to a kopeck, which is waived below the minimum', () => {
    const now = new Date(periodEnd.getTime() - 1000);
    expect(prorate({ ...base, now, minChargeMinor: 100 })).toEqual({
      chargeMinor: 1,
      waived: true,
    });
  });

  test('a remainder rounds up', () => {
    const now = new Date(periodStart.getTime() + 1000);
    const result = prorate({
      ...base,
      oldPriceMinor: 100,
      newPriceMinor: 101,
      now,
      minChargeMinor: 0,
    });
    expect(result).toEqual({ chargeMinor: 1, waived: false });
  });

  test('never more than the difference, even one second after renewal', () => {
    const now = new Date(periodStart.getTime() + 1000);
    const { chargeMinor } = prorate({ ...base, now, minChargeMinor: 100 });
    expect(chargeMinor).toBeLessThanOrEqual(70_000);
    expect(chargeMinor).toBeGreaterThan(69_990);
  });

  test('at or after the period end there is nothing to charge', () => {
    expect(prorate({ ...base, now: periodEnd, minChargeMinor: 100 })).toEqual({
      chargeMinor: 0,
      waived: true,
    });
  });

  test('before the period start the whole difference is due', () => {
    const now = new Date(periodStart.getTime() - DAY);
    expect(prorate({ ...base, now, minChargeMinor: 100 }).chargeMinor).toBe(70_000);
  });

  test('is not an upgrade when the new price is not higher', () => {
    const now = new Date(periodStart.getTime() + DAY);
    expect(() => prorate({ ...base, newPriceMinor: 50_000, now, minChargeMinor: 100 })).toThrow();
  });
});
