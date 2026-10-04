import { describe, expect, test } from 'vitest';
import { formatBytes, formatDuration } from './bytes';

const uk = (value: number, options: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('uk', options).format(value);
const en = (value: number, options: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('en', options).format(value);

describe('formatBytes', () => {
  test('decimal units, one decimal below 10', () => {
    expect(en(1, { style: 'unit', unit: 'byte' })).toContain('1');
    expect(formatBytes(en, 1_200_000_000)).toBe('1.2 GB');
    expect(formatBytes(en, 50_000_000)).toBe('50 MB');
    expect(formatBytes(en, 8_600_000)).toBe('8.6 MB');
    expect(formatBytes(en, 2_300)).toBe('2.3 kB');
    expect(formatBytes(uk, 1_200_000_000)).toMatch(/^1,2\s?ГБ$/);
  });
});

describe('formatDuration', () => {
  test('minutes and seconds, hours when needed', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(400)).toBe('0:00');
  });
});
