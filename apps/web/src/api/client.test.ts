import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiRequest } from './client';

const okSchema = z.object({ status: z.literal('ok') });

function stubFetch(response: Response | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('prefixes /api/v1, sends JSON and parses the response with the schema', async () => {
    const fetchMock = stubFetch(Response.json({ status: 'ok' }));
    const body = await apiRequest('/me', { method: 'PATCH', body: { a: 1 }, schema: okSchema });
    expect(body).toEqual({ status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/me');
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
  });

  test('204 resolves to undefined without a schema', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  test('maps a problem+json body to ApiError', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          code: 'RATE_LIMITED',
          retryable: true,
          requestId: 'req-12345678',
        }),
        { status: 429, headers: { 'content-type': 'application/problem+json' } },
      ),
    );
    const error = await apiRequest('/auth/login', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429, requestId: 'req-12345678' });
  });

  test('keeps problem extension members on the error', async () => {
    stubFetch(
      Response.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'UPLOAD_INCOMPLETE',
          retryable: true,
          missingPartNumbers: [3],
        },
        { status: 409 },
      ),
    );
    const error = await apiRequest('/x', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'UPLOAD_INCOMPLETE',
      problem: { missingPartNumbers: [3] },
    });
  });

  test('an aborted call rethrows the abort, not a network failure', async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetch(new DOMException('Aborted', 'AbortError'));
    const error = await apiRequest('/x', { signal: controller.signal }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  test('a non-JSON 502 becomes UPSTREAM_UNAVAILABLE', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiRequest('/me', {})).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 502,
    });
  });

  test('a network failure becomes UPSTREAM_UNAVAILABLE with status 0', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    await expect(apiRequest('/me', {})).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 0,
    });
  });

  test('a 200 body that breaks the contract is an error, not silently accepted', async () => {
    stubFetch(Response.json({ status: 'nope' }));
    await expect(apiRequest('/me', { schema: okSchema })).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });
});
