import {
  type Collection,
  collectionDetailSchema,
  type GuestPageEditor,
  guestPageEditorSchema,
  type ImageSlotParam,
  type SaveGuestPageDraftRequest,
  collectionListResponseSchema,
  collectionSchema,
  type CollectionStatus,
  type CreateCollectionRequest,
  type UpdateCollectionRequest,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { UploadApi } from '@/guest/upload/transport';
import { apiRequest, isApiError } from './client';

/** Everything under it is refetched after any collection change. */
export const COLLECTIONS_KEY = ['collections'] as const;
export const collectionsListKey = (status: CollectionStatus) =>
  ['collections', 'list', status] as const;
export const collectionKey = (id: string) => ['collections', 'detail', id] as const;
export const USAGE_KEY = ['me', 'usage'] as const;

export function listCollections(status: CollectionStatus, cursor?: string) {
  const query = new URLSearchParams({ status });
  if (cursor !== undefined) query.set('cursor', cursor);
  return apiRequest(`/collections?${query.toString()}`, { schema: collectionListResponseSchema });
}

export const fetchCollection = (id: string) =>
  apiRequest(`/collections/${encodeURIComponent(id)}`, { schema: collectionDetailSchema });

export const fetchUsage = () => apiRequest('/me/usage', { schema: usageResponseSchema });

export const createCollection = (body: CreateCollectionRequest): Promise<Collection> =>
  apiRequest('/collections', { method: 'POST', body, schema: collectionSchema });

/** Refetches the lists, the details and the active-collection counter after a change. */
export function useInvalidateCollections(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: USAGE_KEY }),
    ]);
  }, [queryClient]);
}

export const updateCollection = (id: string, body: UpdateCollectionRequest): Promise<Collection> =>
  apiRequest(`/collections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
    schema: collectionSchema,
  });

export const archiveCollection = (id: string): Promise<Collection> =>
  apiRequest(`/collections/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    schema: collectionSchema,
  });

export const unarchiveCollection = (id: string): Promise<Collection> =>
  apiRequest(`/collections/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    schema: collectionSchema,
  });

export const deleteCollection = (id: string): Promise<void> =>
  apiRequest(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** A missing, foreign or deleted collection, or a malformed id: all the same "not found" to the UI. */
export const isCollectionNotFound = (error: unknown): boolean =>
  isApiError(error, 'NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');

// The guest page editor (plan Task 13, ADR 0017): the published version and the draft. Every
// answer is the whole editor state; image routes create the draft if there is none and never
// change its revision.

export const guestPageKey = (id: string) => ['collections', 'guest-page', id] as const;

const guestPageBase = (id: string) => `/collections/${encodeURIComponent(id)}/guest-page`;

export const fetchGuestPage = (id: string): Promise<GuestPageEditor> =>
  apiRequest(guestPageBase(id), { schema: guestPageEditorSchema });

export const saveGuestPageDraft = (
  id: string,
  body: SaveGuestPageDraftRequest,
): Promise<GuestPageEditor> =>
  apiRequest(`${guestPageBase(id)}/draft`, { method: 'PUT', body, schema: guestPageEditorSchema });

export const publishGuestPage = (id: string, revision: number): Promise<GuestPageEditor> =>
  apiRequest(`${guestPageBase(id)}/publish`, {
    method: 'POST',
    body: { revision },
    schema: guestPageEditorSchema,
  });

/** «Скинути зміни»: deletes the draft. Idempotent. */
export const discardGuestPageDraft = (id: string): Promise<void> =>
  apiRequest(`${guestPageBase(id)}/draft`, { method: 'DELETE' });

/** The draft's cover or background upload calls, in the shape the upload transport takes. */
export function draftImageApi(id: string, slot: ImageSlotParam): UploadApi<GuestPageEditor> {
  const uploads = `${guestPageBase(id)}/draft/${slot}/uploads`;
  const one = (uploadId: string) => `${uploads}/${encodeURIComponent(uploadId)}`;
  return {
    initiate: (body) =>
      apiRequest(uploads, { method: 'POST', body, schema: uploadSessionResponseSchema }),
    parts: (uploadId, partNumbers, signal) =>
      apiRequest(`${one(uploadId)}/parts`, {
        method: 'POST',
        body: { partNumbers },
        schema: uploadPartsResponseSchema,
        signal,
      }),
    complete: (uploadId, signal) =>
      apiRequest(`${one(uploadId)}/complete`, {
        method: 'POST',
        schema: guestPageEditorSchema,
        signal,
      }),
    cancel: (uploadId) => apiRequest(one(uploadId), { method: 'DELETE' }),
  };
}

/** Copies a guest's PHOTO frame into the draft's cover or background. */
export const setDraftImageFromFrame = (
  id: string,
  slot: ImageSlotParam,
  contentItemId: string,
): Promise<GuestPageEditor> =>
  apiRequest(`${guestPageBase(id)}/draft/${slot}/from-frame`, {
    method: 'POST',
    body: { contentItemId },
    schema: guestPageEditorSchema,
  });

/** Points the draft's cover or background back at an image the collection still has (undo). */
export const restoreDraftImage = (
  id: string,
  slot: ImageSlotParam,
  imageId: string,
): Promise<GuestPageEditor> =>
  apiRequest(`${guestPageBase(id)}/draft/${slot}/restore`, {
    method: 'POST',
    body: { imageId },
    schema: guestPageEditorSchema,
  });

/** Removes the draft's cover or background (the published one stays). */
export const removeDraftImage = (id: string, slot: ImageSlotParam): Promise<GuestPageEditor> =>
  apiRequest(`${guestPageBase(id)}/draft/${slot}`, {
    method: 'DELETE',
    schema: guestPageEditorSchema,
  });

// «Картинка колекції» (plan Task 24, ADR 0017): the owner's own image of the collection, on the
// dashboard and in the share dialog only. Changes answer the collection (removal: nothing).

const collectionImageBase = (id: string) => `/collections/${encodeURIComponent(id)}/image`;

/** The collection image upload calls, in the shape the upload transport takes. */
export function collectionImageApi(id: string): UploadApi<Collection> {
  const uploads = `${collectionImageBase(id)}/uploads`;
  const one = (uploadId: string) => `${uploads}/${encodeURIComponent(uploadId)}`;
  return {
    initiate: (body) =>
      apiRequest(uploads, { method: 'POST', body, schema: uploadSessionResponseSchema }),
    parts: (uploadId, partNumbers, signal) =>
      apiRequest(`${one(uploadId)}/parts`, {
        method: 'POST',
        body: { partNumbers },
        schema: uploadPartsResponseSchema,
        signal,
      }),
    complete: (uploadId, signal) =>
      apiRequest(`${one(uploadId)}/complete`, {
        method: 'POST',
        schema: collectionSchema,
        signal,
      }),
    cancel: (uploadId) => apiRequest(one(uploadId), { method: 'DELETE' }),
  };
}

/** Copies a guest's PHOTO frame into the collection image. */
export const setCollectionImageFromFrame = (
  id: string,
  contentItemId: string,
): Promise<Collection> =>
  apiRequest(`${collectionImageBase(id)}/from-frame`, {
    method: 'POST',
    body: { contentItemId },
    schema: collectionSchema,
  });

/** Removes the collection image (the initials show again). Idempotent. */
export const removeCollectionImage = (id: string): Promise<void> =>
  apiRequest(collectionImageBase(id), { method: 'DELETE' });
