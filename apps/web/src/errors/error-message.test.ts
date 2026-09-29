import { ERROR_CODES } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import { errorMessageKey } from './error-message';

describe('errorMessageKey', () => {
  test.each(ERROR_CODES)('%s has a message in both catalogs', (code) => {
    const key = errorMessageKey(code);
    expect(key).toMatch(/^errors\./);
    const name = key.slice('errors.'.length);
    expect(uk.errors).toHaveProperty(name);
    expect(en.errors).toHaveProperty(name);
  });
});
