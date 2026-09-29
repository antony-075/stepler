import { afterEach, describe, expect, test, vi } from 'vitest';
import { testEnv } from '../../test/support/env.js';
import { AppError } from '../errors/app-error.js';
import { CloudflareTurnstileVerifier, SITEVERIFY_URL } from './turnstile-verifier.js';

const verifier = new CloudflareTurnstileVerifier(testEnv({ TURNSTILE_SECRET_KEY: 'secret-key' }));

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('CloudflareTurnstileVerifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('success: true → true, sending secret, response and remote IP', async () => {
    const fetchMock = stubFetch(() => json({ success: true }));
    expect(await verifier.verify('tok', '203.0.113.7')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(SITEVERIFY_URL);
    // The 5 s timeout is enforced by the request's abort signal.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const sent = init?.body as URLSearchParams;
    expect(Object.fromEntries(sent)).toEqual({
      secret: 'secret-key',
      response: 'tok',
      remoteip: '203.0.113.7',
    });
  });

  test('success: false → false', async () => {
    stubFetch(() => json({ success: false, 'error-codes': ['invalid-input-response'] }));
    expect(await verifier.verify('tok')).toBe(false);
  });

  test('empty or oversized token → false without a network call', async () => {
    const fetchMock = stubFetch(() => json({ success: true }));
    expect(await verifier.verify('')).toBe(false);
    expect(await verifier.verify('x'.repeat(2049))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a 5xx response', () => json({ error: 'x' }, 502)],
    ['a malformed body', () => Promise.resolve(new Response('not json'))],
  ])('%s → DEPENDENCY_UNAVAILABLE (fail closed)', async (_label, impl) => {
    stubFetch(impl);
    const error = await verifier.verify('tok').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true });
  });
});
