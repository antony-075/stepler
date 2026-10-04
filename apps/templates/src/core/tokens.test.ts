import type { Hex } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { classic } from '../templates/classic/definition.js';
import { contrastRatio, MIN_RATIO } from './contrast.js';
import { fullscreenLike } from './test-definitions.js';
import { accentContrast, assertReadable, ContrastError, themeTokens } from './tokens.js';

describe('themeTokens', () => {
  test('classic defaults: the palette as is, the pencil accent with a white label', () => {
    const tokens = themeTokens(classic, classic.defaults);
    expect(tokens).toMatchObject({
      '--tpl-bg': '#F0F1EE',
      '--tpl-bg-image-veil': '0',
      '--tpl-gradient': 'none',
      '--tpl-text': '#141614',
      '--tpl-accent': '#B83E26',
      '--tpl-on-accent': '#FFFFFF',
      '--tpl-accent-text': '#B83E26',
      '--tpl-accent-soft': 'rgb(184 62 38 / 0.22)',
      '--tpl-accent-glow': 'rgb(184 62 38 / 0.55)',
      '--tpl-radius-tile': '8px',
      '--tpl-radius-btn': '10px',
      '--tpl-radius-card': '12px',
      '--tpl-radius-bar': '18px',
      '--tpl-align': 'start',
    });
  });

  test('lime on classic: the fill stays lime, its text form darkens, its label is ink', () => {
    const tokens = themeTokens(classic, { ...classic.defaults, accent: '#C5F04A' });
    expect(tokens['--tpl-accent']).toBe('#C5F04A');
    expect(tokens['--tpl-on-accent']).toBe('#141614');
    const text = tokens['--tpl-accent-text'] as Hex;
    expect(text).not.toBe('#C5F04A');
    expect(contrastRatio(text, '#F0F1EE')).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(contrastRatio(text, '#FFFFFF')).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  test('a gradient gives its CSS and its first stop as the base colour', () => {
    const tokens = themeTokens(classic, {
      ...classic.defaults,
      background: { kind: 'gradient', preset: 'sand' },
    });
    expect(tokens['--tpl-gradient']).toBe('linear-gradient(180deg, #F0F1EE, #EFE8DD)');
    expect(tokens['--tpl-bg']).toBe('#F0F1EE');
  });

  test('an image never gets less veil than readability needs', () => {
    const min = classic.options.imageDim.min;
    const tokens = themeTokens(classic, {
      ...classic.defaults,
      background: { kind: 'image', dim: min },
    });
    expect(Number(tokens['--tpl-bg-image-veil'])).toBeGreaterThanOrEqual(min / 100 - 0.01);
    const more = themeTokens(classic, {
      ...classic.defaults,
      background: { kind: 'image', dim: 80 },
    });
    expect(more['--tpl-bg-image-veil']).toBe('0.8');
  });

  test('corners map to the Appendix B radii', () => {
    expect(themeTokens(classic, { ...classic.defaults, corners: 'sharp' })).toMatchObject({
      '--tpl-radius-tile': '2px',
      '--tpl-radius-btn': '4px',
      '--tpl-radius-card': '4px',
      '--tpl-radius-bar': '8px',
    });
    expect(themeTokens(classic, { ...classic.defaults, corners: 'round' })).toMatchObject({
      '--tpl-radius-tile': '14px',
      '--tpl-radius-btn': '999px',
      '--tpl-radius-card': '22px',
      '--tpl-radius-bar': '30px',
    });
  });
});

describe('accentContrast', () => {
  test('levels and direction on the light classic background', () => {
    expect(accentContrast(classic, classic.defaults)).toMatchObject({
      level: 'good',
      direction: 'darker',
    });
    const lime = accentContrast(classic, { ...classic.defaults, accent: '#C5F04A' });
    expect(lime.level).toBe('merges');
    expect(lime.ratio).toBeCloseTo(1.2, 1);
    expect(accentContrast(classic, { ...classic.defaults, accent: '#8B5CF6' }).level).toBe(
      'small-text',
    );
  });

  test('a dark template asks for a lighter accent', () => {
    expect(
      accentContrast(fullscreenLike, { ...fullscreenLike.defaults, accent: '#5A4A8C' }).direction,
    ).toBe('lighter');
  });
});

describe('assertReadable', () => {
  test('passes for the defaults and throws for a broken palette', () => {
    expect(() => assertReadable(classic, classic.defaults)).not.toThrow();
    // A palette whose surfaces span black to white cannot carry any text colour.
    const broken = {
      ...classic,
      palette: { ...classic.palette, surfaces: ['#000000', '#FFFFFF', '#777777'] as const },
    };
    expect(() => assertReadable(broken, classic.defaults)).toThrow(ContrastError);
  });
});
