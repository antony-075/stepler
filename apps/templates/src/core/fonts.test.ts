import { statSync } from 'node:fs';
import { FONT_IDS } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { fontCssVar, FONTS } from './fonts.ts';

const MAX_BYTES = 160 * 1024;

describe('FONTS', () => {
  test('covers exactly the contract’s font ids', () => {
    expect(Object.keys(FONTS).sort()).toEqual([...FONT_IDS].sort());
  });

  test.each(FONT_IDS)('%s: every file is committed, non-empty and under 160 KB', (id) => {
    expect(FONTS[id].files.length).toBeGreaterThan(0);
    for (const { file } of FONTS[id].files) {
      const { size } = statSync(new URL(`../../fonts/${file}`, import.meta.url));
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(MAX_BYTES);
    }
  });

  test('the CSS variable name', () => {
    expect(fontCssVar('pt-serif')).toBe('--font-tpl-pt-serif');
  });
});
