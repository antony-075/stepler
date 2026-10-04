import { describe, expect, test } from 'vitest';
import { renderMagicLinkEmail } from './magic-link.js';

const url = 'https://stepler.test/auth/verify?token=abc_DEF-123';
const appOrigin = 'https://stepler.test';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('renderMagicLinkEmail', () => {
  test('text contains the URL once and HTML links to it once', () => {
    const email = renderMagicLinkEmail({ url, locale: 'en', expiresInMinutes: 15, appOrigin });
    expect(count(email.text, url)).toBe(1);
    expect(count(email.html, `href="${url}"`)).toBe(1);
  });

  test('states the expiry in minutes in both languages', () => {
    for (const locale of ['uk', 'en'] as const) {
      const email = renderMagicLinkEmail({ url, locale, expiresInMinutes: 15, appOrigin });
      expect(email.text).toContain('15');
      expect(email.html).toContain('15');
    }
  });

  test('subject differs by locale', () => {
    const uk = renderMagicLinkEmail({ url, locale: 'uk', expiresInMinutes: 15, appOrigin });
    const en = renderMagicLinkEmail({ url, locale: 'en', expiresInMinutes: 15, appOrigin });
    expect(uk.subject).not.toBe(en.subject);
    expect(uk.text).not.toBe(en.text);
  });

  test('escapes the URL in HTML', () => {
    const hostile = 'https://stepler.test/auth/verify?token="><script>alert(1)</script>';
    const email = renderMagicLinkEmail({
      url: hostile,
      locale: 'en',
      expiresInMinutes: 15,
      appOrigin,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&quot;&gt;&lt;script&gt;');
  });

  test('states the legal acceptance with absolute links to both documents (ADR 0016)', () => {
    const lines = {
      uk: 'Продовжуючи, ви приймаєте Умови використання',
      en: 'By continuing, you accept the Terms of Service',
    } as const;
    for (const locale of ['uk', 'en'] as const) {
      const email = renderMagicLinkEmail({ url, locale, expiresInMinutes: 15, appOrigin });
      expect(email.text).toContain(lines[locale]);
      expect(email.text).toContain(`${appOrigin}/legal/terms`);
      expect(email.text).toContain(`${appOrigin}/legal/privacy`);
      expect(email.html).toContain(`href="${appOrigin}/legal/terms"`);
      expect(email.html).toContain(`href="${appOrigin}/legal/privacy"`);
    }
  });
});
