import { describe, expect, test } from 'vitest';
import { meResponseSchema, updateMeRequestSchema } from './index.js';

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
    };
    expect(meResponseSchema.parse(me)).toEqual(me);
  });
});
