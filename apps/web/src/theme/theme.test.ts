import { describe, expect, test } from 'vitest';
import { parseTheme, themeCookie } from './theme';

describe('parseTheme', () => {
  test.each(['system', 'light', 'dark'] as const)('keeps %s', (value) => {
    expect(parseTheme(value)).toBe(value);
  });

  test.each([undefined, '', 'Dark', 'blue', 'dark '])('maps %j to system', (value) => {
    expect(parseTheme(value)).toBe('system');
  });
});

describe('themeCookie', () => {
  test('lasts a year on every path and is sent on top-level navigations', () => {
    expect(themeCookie('dark', { secure: false })).toBe(
      'st_theme=dark; max-age=31536000; path=/; samesite=lax',
    );
  });

  test('is Secure over https', () => {
    expect(themeCookie('light', { secure: true })).toBe(
      'st_theme=light; max-age=31536000; path=/; samesite=lax; secure',
    );
  });
});
