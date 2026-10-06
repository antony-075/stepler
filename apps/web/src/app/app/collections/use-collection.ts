'use client';

import { useQuery } from '@tanstack/react-query';
import { collectionKey, fetchCollection } from '@/api/collections';
import { PREVIEW_POLL_MS } from '@/media/previews';

/**
 * One collection by its id; `enabled: false` stops refetching it (e.g. once it is deleted).
 * While the worker prepares its collection image, it is asked for again every 10 s.
 */
export function useCollection(id: string, enabled = true) {
  return useQuery({
    queryKey: collectionKey(id),
    queryFn: () => fetchCollection(id),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.image?.status === 'PENDING' ? PREVIEW_POLL_MS : false,
  });
}
