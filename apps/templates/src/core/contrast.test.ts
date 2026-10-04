import { describe, expect, test } from 'vitest';
import {
  bestTextOn,
  composite,
  contrastRatio,
  MIN_RATIO,
  minVeil,
  readableOn,
  relativeLuminance,
} from './contrast.js';
import { randomColors } from './test-random.js';

describe('contrastRatio', () => {
  test('white on black is 21:1, and the ratio is symmetric', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  test('matches the editor artboard: pencil ≈ 4.9 and lime ≈ 1.2 on #F0F1EE', () => {
    expect(contrastRatio('#B83E26', '#F0F1EE')).toBeCloseTo(4.9, 1);
    expect(Math.abs(contrastRatio('#B83E26', '#F0F1EE') - 4.9)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(contrastRatio('#C5F04A', '#F0F1EE') - 1.2)).toBeLessThanOrEqual(0.05);
  });
});

describe('composite', () => {
  test('blends in sRGB and returns uppercase #RRGGBB', () => {
    expect(composite('#000000', 0.5, '#FFFFFF')).toBe('#808080');
    expect(composite('#ffffff', 0, '#123abc')).toBe('#123ABC');
    expect(composite('#B83E26', 1, '#FFFFFF')).toBe('#B83E26');
  });
});

describe('bestTextOn', () => {
  test('always reads at ≥ 4.5:1 on 2 000 random fills', () => {
    for (const fill of randomColors(2026, 2000)) {
      expect(contrastRatio(bestTextOn(fill), fill)).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  });

  test('prefers the candidates (ink or white) and falls back to pure black or white', () => {
    expect(bestTextOn('#B83E26')).toBe('#FFFFFF');
    expect(bestTextOn('#C5F04A')).toBe('#141614');
    // Mid grey: neither ink nor white reaches 4.5, pure black does.
    expect(bestTextOn('#808080', ['#FFFFFF'])).toBe('#000000');
  });
});

describe('readableOn', () => {
  test('keeps a colour that already reads', () => {
    expect(readableOn('#B83E26', ['#F0F1EE'])).toBe('#B83E26');
  });

  test('darkens lime on a light background until it reads', () => {
    const result = readableOn('#C5F04A', ['#F0F1EE']);
    expect(contrastRatio(result, '#F0F1EE')).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(relativeLuminance(result)).toBeLessThan(relativeLuminance('#C5F04A'));
  });

  test('lightens a dark colour on a dark background', () => {
    const result = readableOn('#5A4A8C', ['#110F15']);
    expect(contrastRatio(result, '#110F15')).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(relativeLuminance(result)).toBeGreaterThan(relativeLuminance('#5A4A8C'));
  });

  test('reads against every background of a set, for random colours', () => {
    const backgrounds = ['#F0F1EE', '#FFFFFF', '#E4EAEE'] as const;
    for (const color of randomColors(7, 300)) {
      const result = readableOn(color, backgrounds);
      for (const bg of backgrounds) {
        expect(contrastRatio(result, bg)).toBeGreaterThanOrEqual(MIN_RATIO);
      }
    }
  });
});

describe('minVeil', () => {
  test('white text needs about 55 % black over a white picture', () => {
    const alpha = minVeil('#FFFFFF', '#000000');
    expect(Math.abs(alpha - 0.55)).toBeLessThanOrEqual(0.02);
    expect(contrastRatio('#FFFFFF', composite('#000000', alpha, '#FFFFFF'))).toBeGreaterThanOrEqual(
      MIN_RATIO,
    );
    // One step less is not enough.
    expect(contrastRatio('#FFFFFF', composite('#000000', alpha - 0.01, '#FFFFFF'))).toBeLessThan(
      MIN_RATIO,
    );
  });

  test('passes over both extremes for the light templates’ ink on a light veil', () => {
    const alpha = minVeil('#141614', '#F0F1EE');
    for (const base of ['#FFFFFF', '#000000'] as const) {
      expect(contrastRatio('#141614', composite('#F0F1EE', alpha, base))).toBeGreaterThanOrEqual(
        MIN_RATIO,
      );
    }
  });
});
