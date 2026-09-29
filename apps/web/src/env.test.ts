import { expect, test } from 'vitest';
import { loadWebEnv } from './env';

test('loadWebEnv accepts a URL', () => {
  expect(loadWebEnv({ API_INTERNAL_URL: 'http://localhost:4000' })).toEqual({
    API_INTERNAL_URL: 'http://localhost:4000',
    TRUST_PROXY_HEADERS: false,
  });
});

test('loadWebEnv rejects a non-URL without echoing it', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).toThrow(/API_INTERNAL_URL/);
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).not.toThrow(/s3cr3t/);
});

test('loadWebEnv only accepts http(s) API URLs', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'file:///etc/passwd' })).toThrow(/API_INTERNAL_URL/);
});

test('TRUST_PROXY_HEADERS must be explicit true/false', () => {
  expect(
    loadWebEnv({ API_INTERNAL_URL: 'http://a', TRUST_PROXY_HEADERS: 'true' }).TRUST_PROXY_HEADERS,
  ).toBe(true);
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'http://a', TRUST_PROXY_HEADERS: 'yes' })).toThrow(
    /TRUST_PROXY_HEADERS/,
  );
});
