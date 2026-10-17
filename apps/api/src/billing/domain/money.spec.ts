import { describe, expect, test } from 'vitest';
import { formatMinor, parseAmountToMinor } from './money.js';

describe('formatMinor', () => {
  test.each([
    [5, '0.05'],
    [100, '1.00'],
    [734, '7.34'],
    [123_456_789, '1234567.89'],
  ])('%i → %s', (minor, text) => {
    expect(formatMinor(minor)).toBe(text);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2])('rejects %s', (minor) => {
    expect(() => formatMinor(minor)).toThrow();
  });
});

describe('parseAmountToMinor', () => {
  test.each([
    [7.34, 734],
    ['7.3', 730],
    ['7', 700],
    [1, 100],
    ['0.01', 1],
    [1234567.89, 123_456_789],
  ])('%s → %i', (value, minor) => {
    expect(parseAmountToMinor(value)).toBe(minor);
  });

  test('a float sum with more than two decimals throws (an amount mismatch, never a grant)', () => {
    expect(() => parseAmountToMinor(0.1 + 0.2)).toThrow();
  });

  test.each([0, -1, '0.00', '1.234', '1e3', 'abc', '', ' 1', Number.NaN, Infinity])(
    'rejects %s',
    (value) => {
      expect(() => parseAmountToMinor(value)).toThrow();
    },
  );
});
