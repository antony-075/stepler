'use client';

import type { Collection } from '@stepler/contracts';
import { useQuery } from '@tanstack/react-query';
import { collectionsPageKey, listCollections } from '@/api/collections';

/**
 * The account's collections at a glance (the first page of the active and the archived list), for
 * «Ваші пакети» and the collection names in the payment history. A long account may have pack
 * collections past the first page; their payments then show the offer's title alone.
 */
export function useOwnCollections(): { items: Collection[]; isPending: boolean } {
  const active = useQuery({
    queryKey: collectionsPageKey('ACTIVE'),
    queryFn: () => listCollections('ACTIVE'),
  });
  const archived = useQuery({
    queryKey: collectionsPageKey('ARCHIVED'),
    queryFn: () => listCollections('ARCHIVED'),
  });
  return {
    items: [...(active.data?.items ?? []), ...(archived.data?.items ?? [])],
    isPending: active.isPending || archived.isPending,
  };
}
