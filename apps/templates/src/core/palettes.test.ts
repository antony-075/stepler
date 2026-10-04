import { ACCENT_PRESETS, type ThemeSettings } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { minVeil } from './contrast.js';
import type { TemplateDefinition } from './definition.js';
import { TEMPLATE_DEFINITIONS } from './registry.js';
import { randomColors } from './test-random.js';
import { assertReadable } from './tokens.js';

/** Every background a template offers: each swatch, each gradient, and an image at both ends. */
function backgrounds(def: TemplateDefinition): ThemeSettings['background'][] {
  const { options } = def;
  return [
    ...(options.backgroundKinds.includes('solid')
      ? options.swatches.map((color) => ({ kind: 'solid' as const, color }))
      : []),
    ...(options.backgroundKinds.includes('gradient')
      ? options.gradients.map((gradient) => ({ kind: 'gradient' as const, preset: gradient.id }))
      : []),
    ...(options.backgroundKinds.includes('image')
      ? [options.imageDim.min, options.imageDim.max].map((dim) => ({
          kind: 'image' as const,
          dim,
        }))
      : []),
  ];
}

const ACCENTS = [...ACCENT_PRESETS.map((preset) => preset.hex), ...randomColors(42, 200)];

describe.each(TEMPLATE_DEFINITIONS.map((def) => [def.id, def] as const))('%s', (_id, def) => {
  test('its defaults are valid and readable', () => {
    expect(() => assertReadable(def, def.defaults)).not.toThrow();
  });

  test('the image dimming floor keeps the heading colour readable on any picture', () => {
    if (!def.options.backgroundKinds.includes('image')) return;
    expect(def.options.imageDim.min / 100).toBeGreaterThanOrEqual(
      minVeil(def.palette.text, def.palette.veil),
    );
  });

  test('every background × accent × corners × align reads at 4.5:1', () => {
    for (const background of backgrounds(def)) {
      for (const accent of ACCENTS) {
        for (const corners of def.options.corners) {
          for (const align of def.options.aligns) {
            const settings = { ...def.defaults, background, accent, corners, align };
            expect(() => assertReadable(def, settings)).not.toThrow();
          }
        }
      }
    }
  });
});
