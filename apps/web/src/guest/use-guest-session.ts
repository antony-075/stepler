'use client';

import type { GuestContext } from '@stepler/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { isApiError } from '@/api/client';
import { exchangeSession, resolveLink } from './api';
import { type GuestPageState, guestPageState, isPageEndingError } from './guest-state';

export interface GuestSession {
  collectionId: string;
  context: GuestContext;
}

/**
 * Runs a guest call; if the session cookie is missing or no longer valid
 * (`401 GUEST_SESSION_REQUIRED`: cleared cookies, another device's link), exchanges the token
 * again once and repeats the call. A second 401 is thrown as is.
 */
export async function withSessionRetry<T>(
  call: () => Promise<T>,
  reExchange: () => Promise<unknown>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isApiError(error, 'GUEST_SESSION_REQUIRED')) throw error;
    await reExchange();
    return call();
  }
}

/** Resolve (the state and the collection id), then the session exchange under that path [C3]. */
export async function startSession(linkToken: string): Promise<GuestSession> {
  const { collectionId } = await resolveLink(linkToken);
  return { collectionId, context: await exchangeSession(collectionId, linkToken) };
}

export const guestSessionKey = (token: string) => ['guest-session', token] as const;

export type GuestSessionState =
  | { status: 'loading' }
  | {
      status: 'ready';
      collectionId: string;
      context: GuestContext;
      /** Runs a call with the session retry; a link or collection state ends the page. */
      call: <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;
      setContext: (context: GuestContext) => void;
    }
  | { status: GuestPageState; retry: () => void };

/**
 * The guest's session for the link in the address bar. Started once per page; every later call
 * goes through `call`, which re-runs the exchange on a lost cookie and turns a link or collection
 * state from any call into the page's state (pausing a link mid-visit shows the paused page),
 * except a full collection, which fails only that call.
 */
export function useGuestSession(token: string): GuestSessionState {
  const queryClient = useQueryClient();
  const key = guestSessionKey(token);
  const query = useQuery({
    queryKey: key,
    queryFn: () => startSession(token),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [ended, setEnded] = useState<GuestPageState | null>(null);
  const collectionId = query.data?.collectionId;

  const setContext = useCallback(
    (context: GuestContext) => {
      queryClient.setQueryData<GuestSession>(guestSessionKey(token), (current) =>
        current === undefined ? current : { ...current, context },
      );
    },
    [queryClient, token],
  );

  const call = useCallback(
    async <T>(fn: (collectionId: string) => Promise<T>): Promise<T> => {
      if (collectionId === undefined) throw new Error('No guest session yet');
      try {
        return await withSessionRetry(
          () => fn(collectionId),
          async () => setContext(await exchangeSession(collectionId, token)),
        );
      } catch (error) {
        // A full collection ends the page only when the session itself says so (its first
        // load); for a call (an upload) it fails that call and the page stays (owner decision
        // 2026-10-03: the remaining files fail with a notice).
        if (isPageEndingError(error) && !isApiError(error, 'QUOTA_EXCEEDED')) {
          setEnded(guestPageState(error));
        }
        throw error;
      }
    },
    [collectionId, setContext, token],
  );

  const retry = useCallback(() => {
    setEnded(null);
    void query.refetch();
  }, [query]);

  return useMemo((): GuestSessionState => {
    if (ended !== null) return { status: ended, retry };
    if (query.isPending) return { status: 'loading' };
    if (query.isError) return { status: guestPageState(query.error), retry };
    return {
      status: 'ready',
      collectionId: query.data.collectionId,
      context: query.data.context,
      call,
      setContext,
    };
  }, [ended, retry, query.isPending, query.isError, query.error, query.data, call, setContext]);
}
