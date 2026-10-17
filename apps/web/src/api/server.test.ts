import { legalStatus } from '@stepler/contracts';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSessionUser } from './server';

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(requestHeaders.value) }));

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@stepler.test',
  displayName: null,
  locale: 'uk',
  isOperator: false,
  hasPassword: true,
  legal: legalStatus([]),
};

function stubFetch(response: Response | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('getSessionUser', () => {
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:4000');
    requestHeaders.value = new Headers({ cookie: 'st_session=abc; st_locale=uk' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('forwards the request cookies to GET /api/v1/me, uncached, and returns the user', async () => {
    const fetchMock = stubFetch(Response.json(USER));
    await expect(getSessionUser()).resolves.toEqual(USER);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://api.internal:4000/api/v1/me');
    expect(new Headers(init.headers).get('cookie')).toBe('st_session=abc; st_locale=uk');
    expect(init.cache).toBe('no-store');
  });

  test('returns null on 401', async () => {
    stubFetch(Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 }));
    await expect(getSessionUser()).resolves.toBeNull();
  });

  test('returns null without calling the API when the request has no cookies', async () => {
    requestHeaders.value = new Headers();
    const fetchMock = stubFetch(Response.json(USER));
    await expect(getSessionUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['a 5xx', () => new Response('', { status: 503 })],
    ['a network error', () => new TypeError('fetch failed')],
    ['an unexpected body', () => Response.json({ id: 'nope' })],
  ])("returns 'unavailable' on %s", async (_, make) => {
    stubFetch(make());
    await expect(getSessionUser()).resolves.toBe('unavailable');
  });
});
