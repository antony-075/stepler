'use client';

import type { Collection, CollectionDetail } from '@stepler/contracts';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  archiveCollection,
  collectionKey,
  unarchiveCollection,
  useInvalidateCollections,
} from '@/api/collections';

/**
 * Archive or bring back a collection, from the dashboard's «⋯» menu or its settings. The toast
 * is in the colour of the new state (§5.17): archived is neutral (`info`), back in use is
 * `success`. Failures (the active-collection limit on unarchive) stay on the mutation for the
 * caller to show inline.
 */
export function useArchiveToggle(collection: Collection) {
  const t = useTranslations('collection');
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (to: 'archive' | 'unarchive') =>
      to === 'archive' ? archiveCollection(collection.id) : unarchiveCollection(collection.id),
    onSuccess: async (updated, to) => {
      // The detail also holds the storage line, which a mutation's answer leaves out.
      queryClient.setQueryData<CollectionDetail>(collectionKey(updated.id), (previous) =>
        previous === undefined ? undefined : { ...previous, ...updated },
      );
      toast({
        variant: to === 'archive' ? 'info' : 'success',
        title: to === 'archive' ? t('settingsPage.archived') : t('unarchived'),
      });
      await invalidate();
    },
  });
}
