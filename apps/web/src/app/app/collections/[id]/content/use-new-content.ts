'use client';

import {
  type InfiniteData,
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { contentCounts, contentCountsKey, contentListsKey } from '@/api/content';
import { newFramesCount } from './content-filters';

/** While the «Вміст» tab is shown, counts are polled this often [C6]. */
export const NEW_CONTENT_POLL_MS = 15_000;

/** Drops every loaded page of the collection's lists, so they start again from the first page. */
export function resetContentLists(queryClient: QueryClient, collectionId: string): Promise<void> {
  return queryClient.resetQueries({ queryKey: contentListsKey(collectionId) });
}

/**
 * «Оновити» (owner review 2026-10-03; there is no push yet): every list of the collection keeps
 * only its first page, so it starts again from the top, and is refetched in place (the loaded
 * frames stay on screen meanwhile; lists not on screen refetch when next shown).
 */
export function refreshContentLists(queryClient: QueryClient, collectionId: string): Promise<void> {
  queryClient.setQueriesData<InfiniteData<unknown, unknown>>(
    { queryKey: contentListsKey(collectionId) },
    (data) =>
      data === undefined
        ? data
        : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
  return queryClient.invalidateQueries({ queryKey: contentListsKey(collectionId) });
}

/**
 * [C6]: polls the collection's counts every 15 s while the tab is mounted and the page visible
 * (`refetchIntervalInBackground: false`), and reports how many frames arrived since the list was
 * shown. The grid never moves under the admin's hand: `showNew` resets the lists to their first
 * page on request. `rebase` takes the current total as seen (after the admin deleted a frame).
 */
export function useNewContent(collectionId: string): {
  counts: ReturnType<typeof useCountsQuery>;
  newCount: number;
  showNew: () => void;
  rebase: () => void;
  /** «Оновити»: the counts and the lists from their first page; resolves when both are back. */
  refresh: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const counts = useCountsQuery(collectionId);
  const total = counts.data?.total;
  const [shown, setShown] = useState<number | null>(null);

  // The first answer is the baseline: what the grid shows when it first loads. Set while
  // rendering (React's "adjust state on a prop change"), not in an effect, to avoid a second pass.
  if (shown === null && total !== undefined) setShown(total);

  const showNew = useCallback(() => {
    setShown(total ?? null);
    void resetContentLists(queryClient, collectionId);
  }, [collectionId, queryClient, total]);

  const rebase = useCallback(() => setShown(null), []);

  const { refetch } = counts;
  const refresh = useCallback(async () => {
    const [next] = await Promise.all([refetch(), refreshContentLists(queryClient, collectionId)]);
    // What the grid now shows is the new baseline: nothing is "new" right after a refresh.
    setShown(next.data?.total ?? null);
  }, [collectionId, queryClient, refetch]);

  return { counts, newCount: newFramesCount(shown, total), showNew, rebase, refresh };
}

function useCountsQuery(collectionId: string) {
  return useQuery({
    queryKey: contentCountsKey(collectionId),
    queryFn: () => contentCounts(collectionId),
    refetchInterval: NEW_CONTENT_POLL_MS,
    refetchIntervalInBackground: false,
  });
}
