'use client';

import type { AdminContentItem } from '@stepler/contracts';
import { useToast } from '@stepler/ui/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { isApiError } from '@/api/client';
import { guestPageKey, setDraftImageFromFrame, useInvalidateCollections } from '@/api/collections';
import { imageErrorKey } from '../images/image-errors';

/**
 * «Зробити обкладинкою» in the content viewer [D1]: the frame's original becomes the cover of the
 * guest page's draft (a copy: the frame stays the guest's). Guests see it only after «Зберегти»,
 * which the toast says, with a way to the editor. A refusal (not a photo, quota, archived, the
 * frame gone) is toasted and rethrown, so a picker stays open.
 */
export function useDraftCoverFromFrame(collectionId: string) {
  const t = useTranslations('guestPage');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  return useCallback(
    async (item: AdminContentItem) => {
      try {
        const editor = await setDraftImageFromFrame(collectionId, 'cover', item.id);
        queryClient.setQueryData(guestPageKey(collectionId), editor);
        toast({
          variant: 'success',
          title: t('fromViewer.added'),
          description: t('fromViewer.addedText'),
          action: {
            label: t('fromViewer.open'),
            altText: t('fromViewer.openAlt'),
            onSelect: () =>
              router.push(`/app/collections/${encodeURIComponent(collectionId)}?tab=appearance`),
          },
        });
      } catch (error) {
        const code = isApiError(error) ? error.code : 'INTERNAL';
        toast({
          variant: 'error',
          title: t('image.setFailed'),
          description: tRoot(imageErrorKey(code, 'frame')),
        });
        // Archived elsewhere, or the frame is gone: show the collection and its frames as they are.
        if (code === 'COLLECTION_ARCHIVED' || code === 'NOT_FOUND') await invalidate();
        throw error;
      }
    },
    [collectionId, invalidate, queryClient, router, t, tRoot, toast],
  );
}
