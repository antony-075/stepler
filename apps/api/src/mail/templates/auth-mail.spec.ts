import { describe, expect, test } from 'vitest';
import { renderAuthMail } from './auth-mail.js';
import { formatHours, formatMinutes } from './messages.js';

const url = 'https://stepler.test/auth/verify?token=abc_DEF-123';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('renderAuthMail', () => {
  test.each(['verify', 'reset', 'exists'] as const)(
    '%s: the URL once in the text, one link in the HTML',
    (kind) => {
      const email = renderAuthMail({ kind, url, locale: 'en', duration: '1 hour' });
      expect(count(email.text, url)).toBe(1);
      expect(count(email.html, `href="${url}"`)).toBe(1);
    },
  );

  test('states how long the link works, in both languages', () => {
    const uk = renderAuthMail({
      kind: 'reset',
      url,
      locale: 'uk',
      duration: formatMinutes('uk', 60),
    });
    expect(uk.text).toContain('60 хвилин');
    const en = renderAuthMail({
      kind: 'verify',
      url,
      locale: 'en',
      duration: formatHours('en', 24),
    });
    expect(en.text).toContain('24 hours');
    expect(uk.subject).not.toBe(en.subject);
  });

  test('the account-exists notice has no expiry line', () => {
    const email = renderAuthMail({ kind: 'exists', url, locale: 'uk', duration: null });
    expect(email.text).not.toContain('діє');
  });

  test('escapes the URL in HTML', () => {
    const hostile = 'https://stepler.test/auth/verify?token="><script>alert(1)</script>';
    const email = renderAuthMail({ kind: 'verify', url: hostile, locale: 'en', duration: null });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});
