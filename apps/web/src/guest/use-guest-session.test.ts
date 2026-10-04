import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { exchangeSession, listGuestContent } from './api';
import { guestPageState } from './guest-state';
import { startSession, withSessionRetry } from './use-guest-session';

const CID = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const context = {
  collection: { id: CID, title: 'Весілля', description: null, welcomeMessage: null, cover: null },
  permissions: {
    canUploadPhotos: true,
    canUploadVideos: true,
    canUploadDocuments: true,
    canSubmitText: true,
    canViewGallery: false,
    canDeleteOwn: true,
  },
  guest: { name: null, nameAnswered: false },
  limits: {
    maxFileBytes: { photo: 50_000_000, video: 2_000_000_000, document: 50_000_000 },
    filesPerBatch: 100,
    textMaxChars: 5000,
  },
  counts: null,
};
const page = { items: [], nextCursor: null };
const problem = (code: string, status: number) =>
  new Response(
    JSON.stringify({ type: 'about:blank', title: code, status, code, retryable: false }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  );
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Answers by path: a queue of responses per path suffix. */
function fakeFetch(routes: Record<string, Response[]>) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: string) => {
    const path = new URL(input, 'http://localhost').pathname;
    calls.push(path);
    const key = Object.keys(routes).find((suffix) => path.endsWith(suffix));
    const next = key === undefined ? undefined : routes[key]?.shift();
    return Promise.resolve(next ?? new Response(null, { status: 599 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withSessionRetry', () => {
  it('a lost cookie (401 GUEST_SESSION_REQUIRED) re-runs the exchange once, then succeeds', async () => {
    const calls = fakeFetch({
      '/content': [problem('GUEST_SESSION_REQUIRED', 401), ok(page)],
      '/session': [ok(context)],
    });
    const result = await withSessionRetry(
      () => listGuestContent(CID, { scope: 'own' }),
      () => exchangeSession(CID, 'token'),
    );
    expect(result).toEqual(page);
    expect(calls.map((path) => path.split('/').at(-1))).toEqual(['content', 'session', 'content']);
  });

  it('a second 401 is not retried again and reads as a failure', async () => {
    const calls = fakeFetch({
      '/content': [problem('GUEST_SESSION_REQUIRED', 401), problem('GUEST_SESSION_REQUIRED', 401)],
      '/session': [ok(context)],
    });
    const error = await withSessionRetry(
      () => listGuestContent(CID, { scope: 'own' }),
      () => exchangeSession(CID, 'token'),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(guestPageState(error)).toBe('failed');
    expect(calls).toHaveLength(3);
  });

  it('other errors are not retried', async () => {
    const reExchange = vi.fn();
    const error = await withSessionRetry(
      () => Promise.reject(new ApiError('LINK_INACTIVE', 403)),
      reExchange,
    ).catch((e: unknown) => e);
    expect(guestPageState(error)).toBe('paused');
    expect(reExchange).not.toHaveBeenCalled();
  });
});

describe('startSession', () => {
  it('resolves, then exchanges under the collection path', async () => {
    const calls = fakeFetch({
      '/links/resolve': [
        ok({
          collectionId: CID,
          collection: { title: 'Весілля', description: null },
          permissions: context.permissions,
        }),
      ],
      '/session': [ok(context)],
    });
    const session = await startSession('token');
    expect(session.collectionId).toBe(CID);
    expect(calls).toEqual([
      '/api/v1/guest/links/resolve',
      `/api/v1/guest/collections/${CID}/session`,
    ]);
  });
});
