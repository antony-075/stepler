'use client';

import type { AdminContentItem, CollectionDetail } from '@stepler/contracts';
import { useToast } from '@stepler/ui/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, setCoverFromFrame, useInvalidateCollections } from '@/api/collections';
import { coverErrorKey } from './cover-errors';

/**
 * «Зробити обкладинкою» [A8]: copies the frame's original into the cover (the frame stays the
 * guest's; deleting it later keeps the cover). Toasts the result; a refusal
 * (`COVER_SOURCE_INVALID`, `QUOTA_EXCEEDED`, archived) is toasted and rethrown, so a picker
 * stays open. A frame deleted meanwhile says «Кадр уже видалено».
 */
export function useSetCoverFromFrame(collectionId: string) {
  const t = useTranslations('appearance.cover');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  return useCallback(
    async (item: AdminContentItem) => {
      try {
        const collection = await setCoverFromFrame(collectionId, item.id);
        queryClient.setQueryData<CollectionDetail>(collectionKey(collectionId), (previous) =>
          previous === undefined ? undefined : { ...previous, ...collection },
        );
        toast({ variant: 'success', title: t('updated') });
        await invalidate();
      } catch (error) {
        const code = isApiError(error) ? error.code : 'INTERNAL';
        toast({
          variant: 'error',
          title: t('setFailed'),
          description: tRoot(coverErrorKey(code, 'frame')),
        });
        // Archived elsewhere, or the frame is gone: show the collection and its frames as they are.
        if (code === 'COLLECTION_ARCHIVED' || code === 'NOT_FOUND') await invalidate();
        throw error;
      }
    },
    [collectionId, invalidate, queryClient, t, tRoot, toast],
  );
}
