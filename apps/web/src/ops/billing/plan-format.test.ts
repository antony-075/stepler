import { describe, expect, test } from 'vitest';
import { endOfKyivDay, formatPlanBytes } from './plan-format';

const format = (value: number, options: { unit: string }) => `${value} ${options.unit}`;

describe('formatPlanBytes', () => {
  test('binary gigabytes and terabytes, as plans are sold', () => {
    expect(formatPlanBytes(format, String(1024 ** 3))).toBe('1 gigabyte');
    expect(formatPlanBytes(format, String(200 * 1024 ** 3))).toBe('200 gigabyte');
    expect(formatPlanBytes(format, String(1024 ** 4))).toBe('1 terabyte');
  });
});

describe('endOfKyivDay', () => {
  test('summer (UTC+3) and winter (UTC+2)', () => {
    expect(endOfKyivDay('2027-07-01')?.toISOString()).toBe('2027-07-01T21:00:00.000Z');
    expect(endOfKyivDay('2027-01-15')?.toISOString()).toBe('2027-01-15T22:00:00.000Z');
  });

  test('rejects what is not a date', () => {
    expect(endOfKyivDay('')).toBeNull();
    expect(endOfKyivDay('15.01.2027')).toBeNull();
  });
});
