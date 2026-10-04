'use client';

import type { AdminContentItem, CollectionDetail } from '@stepler/contracts';
import { useToast } from '@stepler/ui/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, setCoverFromFrame, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';

/**
 * «Зробити обкладинкою» [A8]: copies the frame's original into the cover (the frame stays the
 * guest's; deleting it later keeps the cover). Toasts the result; a refusal
 * (`COVER_SOURCE_INVALID`, `QUOTA_EXCEEDED`, archived) is toasted and rethrown, so a picker
 * stays open.
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
        toast({
          variant: 'error',
          title: t('setFailed'),
          description: tRoot(errorMessageKey(isApiError(error) ? error.code : 'INTERNAL')),
        });
        throw error;
      }
    },
    [collectionId, invalidate, queryClient, t, tRoot, toast],
  );
}
