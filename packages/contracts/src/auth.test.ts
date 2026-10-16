import { describe, expect, test } from 'vitest';
import {
  authMethodsResponseSchema,
  currentLegalVersions,
  displayNameSchema,
  legalStatus,
  changePasswordRequestSchema,
  ERROR_CODES,
  loginRequestSchema,
  meResponseSchema,
  missingPasswordRules,
  newPasswordSchema,
  passwordChecks,
  registerRequestSchema,
  resetPasswordRequestSchema,
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
      hasPassword: true,
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
  const methods = { password: true, google: false, turnstileSiteKey: 'k' };

  test('carries the current legal versions', () => {
    const body = { ...methods, legal: currentLegalVersions() };
    expect(authMethodsResponseSchema.parse(body)).toEqual(body);
    expect(authMethodsResponseSchema.safeParse(methods).success).toBe(false);
  });
});

describe('the password rules (ADR 0019)', () => {
  test('each rule on its own', () => {
    expect(passwordChecks('')).toEqual({
      length: false,
      upper: false,
      lower: false,
      digit: false,
      special: false,
    });
    expect(passwordChecks('Abcdefg1!')).toEqual({
      length: true,
      upper: true,
      lower: true,
      digit: true,
      special: true,
    });
    // Any alphabet's letters count; a space is not a special character.
    expect(passwordChecks('Пароль 1')).toMatchObject({ upper: true, lower: true, special: false });
  });

  test('the missing rules come in the meter’s order', () => {
    expect(missingPasswordRules('abc')).toEqual(['length', 'upper', 'digit', 'special']);
    expect(missingPasswordRules('Abcdefg1!')).toEqual([]);
  });

  test('a new password meets every rule, 128 characters at most, no control characters', () => {
    expect(newPasswordSchema.safeParse('Abcdefg1!').success).toBe(true);
    expect(newPasswordSchema.safeParse('abcdefg1!').success).toBe(false);
    expect(newPasswordSchema.safeParse(`Aa1!${'x'.repeat(125)}`).success).toBe(false);
    expect(newPasswordSchema.safeParse('Abcdefg1!\n').success).toBe(false);
  });
});

describe('registration and sign-in requests', () => {
  const legal = currentLegalVersions();

  test('registration normalizes the address and needs the rules, Turnstile and the legal box', () => {
    expect(
      registerRequestSchema.parse({
        email: ' Anton@Example.COM ',
        password: 'Abcdefg1!',
        turnstileToken: 't',
        legal,
      }).email,
    ).toBe('anton@example.com');
    const base = { email: 'a@b.io', password: 'Abcdefg1!', turnstileToken: 't', legal };
    expect(registerRequestSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...base, turnstileToken: '' }).success).toBe(false);
    const withoutLegal: Record<string, unknown> = { ...base };
    delete withoutLegal.legal;
    expect(registerRequestSchema.safeParse(withoutLegal).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...base, confirm: 'x' }).success).toBe(false);
  });

  test('login takes any typed password: older ones need not meet today’s rules', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.io', password: 'old' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.io', password: '' }).success).toBe(false);
  });

  test('reset and change need a rule-abiding new password', () => {
    const token = 'a'.repeat(43);
    expect(resetPasswordRequestSchema.safeParse({ token, password: 'Abcdefg1!' }).success).toBe(
      true,
    );
    expect(
      resetPasswordRequestSchema.safeParse({ token: 'x', password: 'Abcdefg1!' }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'weak' })
        .success,
    ).toBe(false);
  });

  test('the sign-in error codes are appended', () => {
    expect(ERROR_CODES.slice(-4)).toEqual([
      'INVALID_CREDENTIALS',
      'EMAIL_NOT_VERIFIED',
      'AUTH_TOKEN_INVALID',
      'CURRENT_PASSWORD_INVALID',
    ]);
  });
});
