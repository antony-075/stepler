import { describe, expect, test } from 'vitest';
import { formatGbInput, formatMoneyInput, parseGbInput, parseMoneyInput } from './form-units';

describe('money in the /ops forms', () => {
  test.each([
    ['499', 49_900],
    ['499,5', 49_950],
    ['499.05', 49_905],
    ['1 499,00', 149_900],
    ['0,01', 1],
  ])('%s грн → %i kopecks', (text, minor) => {
    expect(parseMoneyInput(text)).toBe(minor);
  });

  test.each(['', '0', '0,00', '-5', '4,999', 'abc', '1e3', '0.1+0.2'])(
    '%s is not a price',
    (text) => {
      expect(parseMoneyInput(text)).toBeNull();
    },
  );

  test('formats back to what parses', () => {
    expect(formatMoneyInput(149_905)).toBe('1499,05');
    expect(parseMoneyInput(formatMoneyInput(149_905))).toBe(149_905);
  });
});

describe('storage in GB (binary, as sold)', () => {
  test('GB to bytes and back', () => {
    expect(parseGbInput('10')).toBe(String(10n * 1024n ** 3n));
    expect(parseGbInput('0,5')).toBe(String(512n * 1024n ** 2n));
    expect(parseGbInput('1024')).toBe(String(1024n ** 4n));
    expect(formatGbInput(String(10n * 1024n ** 3n))).toBe('10');
    expect(formatGbInput(String(512n * 1024n ** 2n))).toBe('0,5');
    expect(formatGbInput(null)).toBe('');
  });

  test.each(['', '-1', '1,25', 'ten'])('%s is not a size', (text) => {
    expect(parseGbInput(text)).toBeNull();
  });
});
