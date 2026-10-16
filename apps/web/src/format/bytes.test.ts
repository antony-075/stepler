import { describe, expect, test } from 'vitest';
import { formatBytes, formatDuration, formatStorage } from './bytes';

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

describe('formatStorage', () => {
  const GIB = 1024 ** 3;
  test('binary units named as sold: a limit, its usage and a pack share one base', () => {
    expect(formatStorage(en, 20 * GIB)).toBe('20 GB');
    expect(formatStorage(en, 10 * GIB)).toBe('10 GB');
    expect(formatStorage(en, 50 * GIB)).toBe('50 GB');
    expect(formatStorage(en, 1024 * GIB)).toBe('1 TB');
    expect(formatStorage(en, 3.2 * GIB)).toBe('3.2 GB');
    expect(formatStorage(en, 1.5 * 1024 ** 2)).toBe('1.5 MB');
    expect(formatStorage(en, 0)).toBe('0 MB');
    expect(formatStorage(uk, 20 * GIB)).toMatch(/^20\s?ГБ$/);
    expect(formatStorage(uk, 3.2 * GIB)).toMatch(/^3,2\s?ГБ$/);
  });

  test('never prints a GiB limit as its decimal size', () => {
    // The bug it replaces: `formatBytes(20 GiB)` read «21 ГБ».
    expect(formatBytes(en, 20 * GIB)).toBe('21 GB');
    expect(formatStorage(en, 20 * GIB)).toBe('20 GB');
  });
});

describe('formatDuration', () => {
  test('minutes and seconds, hours when needed', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(400)).toBe('0:00');
  });
});
