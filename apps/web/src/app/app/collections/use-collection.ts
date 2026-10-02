'use client';

import { useQuery } from '@tanstack/react-query';
import { collectionKey, fetchCollection } from '@/api/collections';

/** One collection by its id; `enabled: false` stops refetching it (e.g. once it is deleted). */
export function useCollection(id: string, enabled = true) {
  return useQuery({ queryKey: collectionKey(id), queryFn: () => fetchCollection(id), enabled });
}
