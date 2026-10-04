import { FONT_IDS } from '@stepler/contracts';
import { describe, expect, test, vi } from 'vitest';

// next/font only works inside the Next compiler; here each call returns its variable as a class.
vi.mock('next/font/local', () => ({
  default: (options: { variable: string }) => ({
    className: `font-${options.variable}`,
    variable: `var-${options.variable}`,
    style: { fontFamily: options.variable },
  }),
}));

const { fontVariables, TEMPLATE_FONTS } = await import('./template-fonts');

describe('TEMPLATE_FONTS', () => {
  test('has exactly the contract’s font ids, each with its --font-tpl-* variable', () => {
    expect(Object.keys(TEMPLATE_FONTS).sort()).toEqual([...FONT_IDS].sort());
    for (const id of FONT_IDS) expect(TEMPLATE_FONTS[id].variable).toBe(`--font-tpl-${id}`);
  });

  test('Geologica needs no class (the interface font); the others define their variable', () => {
    expect(TEMPLATE_FONTS.geologica.className).toBe('');
    expect(TEMPLATE_FONTS.manrope.className).toBe('var---font-tpl-manrope');
  });
});

describe('fontVariables', () => {
  test('one class per font in use, none for Geologica', () => {
    expect(fontVariables('geologica', 'geologica')).toBe('');
    expect(fontVariables('unbounded', 'manrope')).toBe(
      'var---font-tpl-unbounded var---font-tpl-manrope',
    );
    expect(fontVariables('manrope', 'manrope')).toBe('var---font-tpl-manrope');
  });
});
