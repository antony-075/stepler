import { describe, expect, test } from 'vitest';
import {
  ACCENT_PRESETS,
  FONT_IDS,
  hexColorSchema,
  templateIdSchema,
  themeSettingsSchema,
  type ThemeSettings,
} from './index.js';

const valid: ThemeSettings = {
  background: { kind: 'solid', color: '#F0F1EE' },
  accent: '#B83E26',
  headingFont: 'geologica',
  coverPlacement: 'top',
  align: 'start',
  corners: 'soft',
};

describe('themeSettingsSchema', () => {
  test('accepts a complete settings object, for every background kind', () => {
    expect(themeSettingsSchema.parse(valid)).toEqual(valid);
    for (const background of [
      { kind: 'gradient', preset: 'mist' },
      { kind: 'image', dim: 0 },
      { kind: 'image', dim: 90 },
    ]) {
      expect(themeSettingsSchema.safeParse({ ...valid, background }).success).toBe(true);
    }
  });

  test('rejects a lowercase or named accent, an extra key and a dim above 90', () => {
    expect(themeSettingsSchema.safeParse({ ...valid, accent: '#b83e26' }).success).toBe(false);
    expect(themeSettingsSchema.safeParse({ ...valid, accent: 'red' }).success).toBe(false);
    expect(themeSettingsSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(
      themeSettingsSchema.safeParse({ ...valid, background: { kind: 'image', dim: 91 } }).success,
    ).toBe(false);
    expect(
      themeSettingsSchema.safeParse({ ...valid, background: { kind: 'image', dim: 4.5 } }).success,
    ).toBe(false);
    expect(
      themeSettingsSchema.safeParse({
        ...valid,
        background: { kind: 'solid', color: '#FFFFFF', dim: 10 },
      }).success,
    ).toBe(false);
  });

  test('rejects an unknown font, placement, alignment or corners value', () => {
    for (const patch of [
      { headingFont: 'comic-sans' },
      { coverPlacement: 'bottom' },
      { align: 'end' },
      { corners: 'square' },
    ]) {
      expect(themeSettingsSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});

describe('vocabulary', () => {
  test('twelve fonts and six accent presets, every preset a valid colour', () => {
    expect(FONT_IDS).toHaveLength(12);
    expect(new Set(FONT_IDS).size).toBe(12);
    expect(ACCENT_PRESETS.map((preset) => preset.id)).toEqual([
      'pencil',
      'apricot',
      'plum',
      'emerald',
      'electric',
      'lime',
    ]);
    for (const preset of ACCENT_PRESETS) expect(hexColorSchema.parse(preset.hex)).toBe(preset.hex);
  });

  test('template ids are short lowercase slugs', () => {
    for (const id of ['classic', 'party', 'a', 'x1-y2']) {
      expect(templateIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ['', 'Classic', '1st', '-a', 'a_b', 'a'.repeat(41)]) {
      expect(templateIdSchema.safeParse(id).success).toBe(false);
    }
  });
});
