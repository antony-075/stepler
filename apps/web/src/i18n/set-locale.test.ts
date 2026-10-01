import { describe, expect, test } from 'vitest';
import { localeCookie } from './set-locale';

describe('localeCookie', () => {
  test('lasts a year on every path and is sent on top-level navigations', () => {
    expect(localeCookie('en', { secure: false })).toBe(
      'st_locale=en; max-age=31536000; path=/; samesite=lax',
    );
  });

  test('is Secure over https', () => {
    expect(localeCookie('uk', { secure: true })).toBe(
      'st_locale=uk; max-age=31536000; path=/; samesite=lax; secure',
    );
  });
});
