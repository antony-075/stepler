import { expect, test } from 'vitest';
import { loadWebEnv } from './env';

test('loadWebEnv accepts a URL', () => {
  expect(loadWebEnv({ API_INTERNAL_URL: 'http://localhost:4000' })).toEqual({
    API_INTERNAL_URL: 'http://localhost:4000',
    LEGAL_ALLOW_DRAFT: false,
  });
});

test('loadWebEnv rejects a non-URL without echoing it', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).toThrow(/API_INTERNAL_URL/);
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).not.toThrow(/s3cr3t/);
});

test('loadWebEnv only accepts http(s) API URLs', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'file:///etc/passwd' })).toThrow(/API_INTERNAL_URL/);
});

test('CLIENT_IP_HEADER is a lowercased header name; the old TRUST_PROXY_HEADERS is ignored', () => {
  expect(
    loadWebEnv({ API_INTERNAL_URL: 'http://a', CLIENT_IP_HEADER: 'CF-Connecting-IP' })
      .CLIENT_IP_HEADER,
  ).toBe('cf-connecting-ip');
  expect(() =>
    loadWebEnv({ API_INTERNAL_URL: 'http://a', CLIENT_IP_HEADER: 'x forwarded' }),
  ).toThrow(/CLIENT_IP_HEADER/);
  // X-Forwarded-For is client-controlled at its first entry on Render; it cannot be the source.
  expect(() =>
    loadWebEnv({ API_INTERNAL_URL: 'http://a', CLIENT_IP_HEADER: 'x-forwarded-for' }),
  ).toThrow(/CLIENT_IP_HEADER/);
  expect(loadWebEnv({ API_INTERNAL_URL: 'http://a', TRUST_PROXY_HEADERS: 'true' })).toEqual({
    API_INTERNAL_URL: 'http://a',
    LEGAL_ALLOW_DRAFT: false,
  });
});

test('API_INTERNAL_HOSTPORT (a platform private address) stands in for API_INTERNAL_URL', () => {
  expect(loadWebEnv({ API_INTERNAL_HOSTPORT: 'stepler-api:4000' }).API_INTERNAL_URL).toBe(
    'http://stepler-api:4000',
  );
  expect(
    loadWebEnv({ API_INTERNAL_URL: 'http://a:1', API_INTERNAL_HOSTPORT: 'b:2' }).API_INTERNAL_URL,
  ).toBe('http://a:1');
  expect(() => loadWebEnv({ API_INTERNAL_HOSTPORT: 'not a host/port' })).toThrow(
    /API_INTERNAL_URL/,
  );
  expect(() => loadWebEnv({})).toThrow(/API_INTERNAL_URL/);
});
