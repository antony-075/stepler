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
    cookie: 'st_session=abc',
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
    expect(headers.get('cookie')).toBe('st_session=abc');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept-language')).toBe('uk');
  });

  test('behind a trusted edge, forwards only the client IP it set (first X-Forwarded-For entry)', () => {
    const headers = upstreamRequestHeaders(
      new Headers({
        'x-forwarded-for': '203.0.113.7, 172.70.1.2, 10.0.0.5',
        'x-forwarded-host': 'evil.example',
        'x-real-ip': '9.9.9.9',
      }),
      { trustForwardedHeaders: true },
    );
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    for (const name of ['x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip']) {
      expect(headers.has(name), name).toBe(false);
    }
  });

  test('accepts IPv6 client addresses', () => {
    const headers = upstreamRequestHeaders(
      new Headers({ 'x-forwarded-for': '2001:db8::1, 172.70.1.2' }),
      { trustForwardedHeaders: true },
    );
    expect(headers.get('x-forwarded-for')).toBe('2001:db8::1');
  });

  test.each(['evil.example, 1.2.3.4', '', 'unknown', '1.2.3.4:80'])(
    'drops a first entry that is not an IP address (%j)',
    (value) => {
      const headers = upstreamRequestHeaders(new Headers({ 'x-forwarded-for': value }), {
        trustForwardedHeaders: true,
      });
      expect(headers.has('x-forwarded-for')).toBe(false);
    },
  );
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
