import { describe, expect, it } from 'vitest';
import { MIN_USED_PERCENT, meterPercent } from './usage-meter';

describe('meterPercent', () => {
  it('shows nothing when nothing is used', () => {
    expect(meterPercent(0, 3)).toBe(0);
    expect(meterPercent(0, 0)).toBe(0);
  });

  it('shows a visible sliver for a little use', () => {
    expect(meterPercent(21_000_000, 21_474_836_480)).toBe(MIN_USED_PERCENT);
  });

  it('follows the share and stops at full', () => {
    expect(meterPercent(2, 3)).toBe(67);
    expect(meterPercent(3, 3)).toBe(100);
    expect(meterPercent(5, 3)).toBe(100);
    expect(meterPercent(1, 0)).toBe(100);
  });
});
