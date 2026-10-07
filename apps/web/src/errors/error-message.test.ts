import { ERROR_CODES } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import { errorMessageKey, signInErrorMessage } from './error-message';

describe('errorMessageKey', () => {
  test.each(ERROR_CODES)('%s has a message in both catalogs', (code) => {
    const key = errorMessageKey(code);
    expect(key).toMatch(/^errors\./);
    const name = key.slice('errors.'.length);
    expect(uk.errors).toHaveProperty(name);
    expect(en.errors).toHaveProperty(name);
  });
});

test('a blocked account is told where to write when the contact is set (slice 9)', () => {
  const t = (key: string, values?: Record<string, string>) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`;
  expect(signInErrorMessage(t, 'ACCOUNT_BLOCKED', 'legal@example.com')).toBe(
    'login.accountBlockedContact:{"email":"legal@example.com"}',
  );
  expect(signInErrorMessage(t, 'ACCOUNT_BLOCKED', null)).toBe('errors.ACCOUNT_BLOCKED');
  expect(signInErrorMessage(t, 'OAUTH_FAILED', 'legal@example.com')).toBe('errors.OAUTH_FAILED');
});
