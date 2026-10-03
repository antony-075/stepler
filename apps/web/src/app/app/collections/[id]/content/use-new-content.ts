'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
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

  return { counts, newCount: newFramesCount(shown, total), showNew, rebase };
}

function useCountsQuery(collectionId: string) {
  return useQuery({
    queryKey: contentCountsKey(collectionId),
    queryFn: () => contentCounts(collectionId),
    refetchInterval: NEW_CONTENT_POLL_MS,
    refetchIntervalInBackground: false,
  });
}
