import { describe, expect, test } from 'vitest';
import {
  authMethodsResponseSchema,
  currentLegalVersions,
  displayNameSchema,
  legalStatus,
  magicLinkRequestSchema,
  magicLinkVerifyRequestSchema,
  meResponseSchema,
  updateMeRequestSchema,
} from './index.js';

describe('updateMeRequestSchema', () => {
  test('trims displayName and accepts null to clear it', () => {
    expect(updateMeRequestSchema.parse({ displayName: '  Anton  ' })).toEqual({
      displayName: 'Anton',
    });
    expect(updateMeRequestSchema.parse({ displayName: null })).toEqual({ displayName: null });
  });

  test('rejects blank or too long names, unknown locales and extra keys', () => {
    expect(updateMeRequestSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ locale: 'de' }).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ email: 'a@b.io' }).success).toBe(false);
  });
});

describe('meResponseSchema', () => {
  test('accepts a user', () => {
    const me = {
      id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      email: 'a@example.com',
      displayName: null,
      locale: 'uk',
      isOperator: false,
      legal: legalStatus([]),
    };
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  test('requires the legal status', () => {
    const withoutLegal = {
      id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      email: 'a@example.com',
      displayName: null,
      locale: 'uk',
      isOperator: false,
    };
    expect(meResponseSchema.safeParse(withoutLegal).success).toBe(false);
  });
});

describe('authMethodsResponseSchema', () => {
  const methods = { magicLink: true, google: false, turnstileSiteKey: 'k' };

  test('carries the current legal versions', () => {
    const body = { ...methods, legal: currentLegalVersions() };
    expect(authMethodsResponseSchema.parse(body)).toEqual(body);
    expect(authMethodsResponseSchema.safeParse(methods).success).toBe(false);
  });
});

describe('magicLinkRequestSchema', () => {
  const legal = { terms: 'v1', privacy: 'v1' };

  test('normalizes the email', () => {
    expect(
      magicLinkRequestSchema.parse({ email: ' Anton@Example.COM ', turnstileToken: 't', legal })
        .email,
    ).toBe('anton@example.com');
  });

  test('requires a Turnstile token and rejects extra keys', () => {
    expect(
      magicLinkRequestSchema.safeParse({ email: 'a@b.io', turnstileToken: '', legal }).success,
    ).toBe(false);
    expect(
      magicLinkRequestSchema.safeParse({ email: 'a@b.io', turnstileToken: 't', legal, x: 1 })
        .success,
    ).toBe(false);
  });

  test('requires well-formed legal versions (the sign-in checkbox, server side)', () => {
    expect(magicLinkRequestSchema.safeParse({ email: 'a@b.io', turnstileToken: 't' }).success).toBe(
      false,
    );
    expect(
      magicLinkRequestSchema.safeParse({
        email: 'a@b.io',
        turnstileToken: 't',
        legal: { terms: '<script>', privacy: 'v1' },
      }).success,
    ).toBe(false);
  });
});

describe('magicLinkVerifyRequestSchema', () => {
  test('accepts only 43-character base64url tokens', () => {
    expect(magicLinkVerifyRequestSchema.safeParse({ token: 'A'.repeat(43) }).success).toBe(true);
    expect(magicLinkVerifyRequestSchema.safeParse({ token: 'A'.repeat(42) }).success).toBe(false);
    expect(magicLinkVerifyRequestSchema.safeParse({ token: `${'A'.repeat(42)}=` }).success).toBe(
      false,
    );
  });
});

describe('displayNameSchema', () => {
  test('trims and accepts 1–80 characters on one line', () => {
    expect(displayNameSchema.parse('  Оля Коваль ')).toBe('Оля Коваль');
    expect(displayNameSchema.safeParse('я'.repeat(80)).success).toBe(true);
  });

  test('rejects blank, too long and control characters', () => {
    for (const value of ['   ', 'я'.repeat(81), 'Оля\nКоваль', 'A\u0000']) {
      expect(displayNameSchema.safeParse(value).success).toBe(false);
    }
  });
});
