import { describe, expect, test } from 'vitest';
import { downstreamResponseHeaders, upstreamRequestHeaders, upstreamUrl } from './forward';

const BASE = 'http://api.internal:4000';

describe('upstreamUrl', () => {
  test('keeps path and query on the configured origin', () => {
    expect(upstreamUrl('/api/v1/health/live', '?a=1&b=2', BASE).href).toBe(
      'http://api.internal:4000/api/v1/health/live?a=1&b=2',
    );
  });

  test('rejects paths outside /api/', () => {
    expect(() => upstreamUrl('/other', '', BASE)).toThrow();
  });

  test('never leaves the configured origin', () => {
    expect(() => upstreamUrl('/api//evil.example/x', '', BASE)).not.toThrow();
    expect(upstreamUrl('/api//evil.example/x', '', BASE).origin).toBe(BASE);
  });
});

describe('upstreamRequestHeaders', () => {
  const incoming = new Headers({
    host: 'evil.example',
    'x-forwarded-for': '1.2.3.4',
    'x-forwarded-host': 'evil.example',
    'x-forwarded-proto': 'http',
    forwarded: 'for=1.2.3.4',
    'x-real-ip': '1.2.3.4',
    connection: 'keep-alive',
    expect: '100-continue',
    'transfer-encoding': 'chunked',
    cookie: 'ed_session=abc',
    'content-type': 'application/json',
    'accept-language': 'uk',
  });

  test('drops client-supplied forwarding and hop-by-hop headers by default', () => {
    const headers = upstreamRequestHeaders(incoming, { trustForwardedHeaders: false });
    for (const name of [
      'host',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'forwarded',
      'x-real-ip',
      'connection',
      'transfer-encoding',
      'expect',
    ]) {
      expect(headers.has(name), name).toBe(false);
    }
  });

  test('keeps end-to-end headers', () => {
    const headers = upstreamRequestHeaders(incoming, { trustForwardedHeaders: false });
    expect(headers.get('cookie')).toBe('ed_session=abc');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept-language')).toBe('uk');
  });

  test('passes forwarding headers only when a trusted edge sets them', () => {
    const headers = upstreamRequestHeaders(incoming, { trustForwardedHeaders: true });
    expect(headers.get('x-forwarded-for')).toBe('1.2.3.4');
    expect(headers.has('host')).toBe(false);
  });
});

describe('downstreamResponseHeaders', () => {
  test('drops encoding/length (fetch already decoded the body) and hop-by-hop headers', () => {
    const upstream = new Headers({
      'content-encoding': 'gzip',
      'content-length': '10',
      connection: 'close',
      'content-type': 'application/json',
    });
    upstream.append('set-cookie', 'a=1; Path=/');
    upstream.append('set-cookie', 'b=2; Path=/');
    const headers = downstreamResponseHeaders(upstream);
    expect(headers.has('content-encoding')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
    expect(headers.has('connection')).toBe(false);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });
});
