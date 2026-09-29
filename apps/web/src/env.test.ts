import { expect, test } from 'vitest';
import { loadWebEnv } from './env';

test('loadWebEnv accepts a URL', () => {
  expect(loadWebEnv({ API_INTERNAL_URL: 'http://localhost:4000' })).toEqual({
    API_INTERNAL_URL: 'http://localhost:4000',
  });
});

test('loadWebEnv rejects a non-URL without echoing it', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).toThrow(/API_INTERNAL_URL/);
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).not.toThrow(/s3cr3t/);
});
