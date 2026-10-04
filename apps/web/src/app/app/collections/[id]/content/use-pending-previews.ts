'use client';

import type { AdminContentDetail, AdminContentItem, AdminContentPage } from '@stepler/contracts';
import { type InfiniteData, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { contentListsKey, getContent } from '@/api/content';
import { awaitsPreview, PREVIEW_POLL_MAX, PREVIEW_POLL_MS } from '@/media/previews';

/** The viewer's query key for one frame's detail (presigned links). */
export const contentDetailKey = (id: string) => ['content-detail', id] as const;

/**
 * Puts processed frames into every loaded list of the collection in place (same position, same
 * page), and their detail into the viewer's cache. Frames not loaded are left alone.
 */
export function applyProcessed(
  queryClient: QueryClient,
  collectionId: string,
  details: readonly AdminContentDetail[],
): void {
  const byId = new Map<string, AdminContentItem>(
    details.map(({ originalUrl: _original, downloadUrl: _download, ...item }) => [item.id, item]),
  );
  queryClient.setQueriesData<InfiniteData<AdminContentPage>>(
    { queryKey: contentListsKey(collectionId) },
    (data) =>
      data === undefined
        ? data
        : {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => byId.get(item.id) ?? item),
            })),
          },
  );
  for (const detail of details) queryClient.setQueryData(contentDetailKey(detail.id), detail);
}

/**
 * Asks for these frames again and puts them in place (fresh presigned links, new processing
 * state). Failures are ignored: the next round or «Оновити» tries again.
 */
export async function refreshFrames(
  queryClient: QueryClient,
  collectionId: string,
  ids: readonly string[],
  onlyProcessed = false,
): Promise<void> {
  const results = await Promise.allSettled(ids.map((id) => getContent(id)));
  const fresh = results.flatMap((result) =>
    result.status === 'fulfilled' && (!onlyProcessed || result.value.processingStatus !== 'PENDING')
      ? [result.value]
      : [],
  );
  if (fresh.length > 0) applyProcessed(queryClient, collectionId, fresh);
}

/**
 * While frames on screen wait for the worker (`PENDING`, under 30 minutes old), asks for those
 * frames again every 10 s, at most 12 a round, and swaps each one in place once it is processed:
 * the thumbnail appears where the placeholder was, and nothing else in the grid moves [C6]. Stops
 * when none waits; skips rounds while the page is hidden.
 */
export function usePendingPreviews(collectionId: string, items: readonly AdminContentItem[]) {
  const queryClient = useQueryClient();
  const waiting = items
    .filter((item) => awaitsPreview(item))
    .slice(0, PREVIEW_POLL_MAX)
    .map((item) => item.id)
    .join(',');

  useEffect(() => {
    if (waiting === '') return;
    const ids = waiting.split(',');
    let active = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (active) void refreshFrames(queryClient, collectionId, ids, true);
    }, PREVIEW_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [collectionId, queryClient, waiting]);
}
