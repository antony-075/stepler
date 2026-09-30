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
    const headers = upstreamRequestHeaders(incoming, { clientIpHeader: undefined });
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
    const headers = upstreamRequestHeaders(incoming, { clientIpHeader: undefined });
    expect(headers.get('cookie')).toBe('st_session=abc');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept-language')).toBe('uk');
  });

  test('behind an edge, forwards only the IP from the configured header', () => {
    const headers = upstreamRequestHeaders(
      new Headers({
        'cf-connecting-ip': '203.0.113.7',
        // Render keeps the client-supplied entry first, so X-Forwarded-For is never trusted.
        'x-forwarded-for': '198.51.100.1, 203.0.113.7, 10.0.0.5',
        'x-real-ip': '9.9.9.9',
      }),
      { clientIpHeader: 'cf-connecting-ip' },
    );
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    for (const name of ['cf-connecting-ip', 'x-real-ip', 'forwarded', 'x-forwarded-host']) {
      expect(headers.has(name), name).toBe(false);
    }
  });

  test('accepts IPv6 client addresses', () => {
    const headers = upstreamRequestHeaders(new Headers({ 'cf-connecting-ip': '2001:db8::1' }), {
      clientIpHeader: 'cf-connecting-ip',
    });
    expect(headers.get('x-forwarded-for')).toBe('2001:db8::1');
  });

  test.each(['evil.example', '', 'unknown', '1.2.3.4:80', '1.2.3.4, 5.6.7.8'])(
    'sends no client IP when the header is not a single IP address (%j)',
    (value) => {
      const headers = upstreamRequestHeaders(
        new Headers({ 'cf-connecting-ip': value, 'x-forwarded-for': '1.2.3.4' }),
        { clientIpHeader: 'cf-connecting-ip' },
      );
      expect(headers.has('x-forwarded-for')).toBe(false);
    },
  );

  test('without a configured header, a client-sent cf-connecting-ip is dropped too', () => {
    const headers = upstreamRequestHeaders(new Headers({ 'cf-connecting-ip': '1.2.3.4' }), {
      clientIpHeader: undefined,
    });
    expect(headers.has('cf-connecting-ip')).toBe(false);
    expect(headers.has('x-forwarded-for')).toBe(false);
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
