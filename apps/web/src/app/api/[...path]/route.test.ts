import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

interface Echo {
  method: string | undefined;
  url: string | undefined;
  bytes: number;
  headers: IncomingMessage['headers'];
}

let upstream: Server;
let upstreamClosed: Promise<void>;
const aborted = vi.fn();
let slowArrived: () => void = () => undefined;

async function loadRoute(apiUrl: string) {
  vi.resetModules();
  vi.stubEnv('API_INTERNAL_URL', apiUrl);
  return import('./route');
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url === '/api/slow') {
      req.on('close', aborted);
      slowArrived();
      return; // never responds
    }
    if (req.url === '/api/cookies') {
      res.writeHead(302, {
        location: '/next',
        'set-cookie': ['a=1; Path=/; HttpOnly', 'b=2; Path=/'],
      });
      return res.end();
    }
    let bytes = 0;
    req.on('data', (chunk: Buffer) => (bytes += chunk.length));
    req.on('end', () => {
      const body: Echo = { method: req.method, url: req.url, bytes, headers: req.headers };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  upstreamClosed = new Promise((resolve) => upstream.on('close', () => resolve()));
});

afterAll(async () => {
  upstream.closeAllConnections();
  upstream.close();
  await upstreamClosed;
  vi.unstubAllEnvs();
});

const base = () => `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

describe('/api proxy route', () => {
  test('streams a POST body and keeps the query', async () => {
    const { POST } = await loadRoute(base());
    const payload = new Uint8Array(3 * 1024 * 1024);
    const res = await POST(
      new NextRequest('http://web.local/api/v1/upload?x=1', {
        method: 'POST',
        body: payload,
        headers: { 'x-forwarded-for': '6.6.6.6' },
      }),
    );
    const echo = (await res.json()) as Echo;
    expect(res.status).toBe(200);
    expect(echo).toMatchObject({
      method: 'POST',
      url: '/api/v1/upload?x=1',
      bytes: payload.length,
    });
    expect(echo.headers['x-forwarded-for']).toBeUndefined();
  });

  test('passes redirects through and keeps every Set-Cookie', async () => {
    const { GET } = await loadRoute(base());
    const res = await GET(new NextRequest('http://web.local/api/cookies'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/next');
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/; HttpOnly', 'b=2; Path=/']);
  });

  test('answers 502 problem+json when the API is unreachable', async () => {
    const { GET } = await loadRoute('http://127.0.0.1:1');
    const res = await GET(new NextRequest('http://web.local/api/v1/health/live'));
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
  });

  test('cancels the upstream request when the client disconnects', async () => {
    const { GET } = await loadRoute(base());
    const controller = new AbortController();
    const arrived = new Promise<void>((resolve) => (slowArrived = resolve));
    const pending = GET(
      new NextRequest('http://web.local/api/slow', { signal: controller.signal }),
    );
    await arrived;
    controller.abort();
    await pending.catch(() => undefined);
    await vi.waitFor(() => expect(aborted).toHaveBeenCalled(), { timeout: 2000 });
  });
});
