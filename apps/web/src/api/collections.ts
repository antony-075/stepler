import {
  type Collection,
  collectionDetailSchema,
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

// The collection cover [A1][A8]. The admin's file goes browser → storage like a guest's (the
// same multipart protocol and transport), under the admin session; completion answers with the
// collection, its cover `PENDING` until the worker made the derivatives.

const coverBase = (id: string) => `/collections/${encodeURIComponent(id)}/cover`;

/** The cover upload calls for one collection, in the shape the upload transport takes. */
export function coverUploadApi(collectionId: string): UploadApi<Collection> {
  const uploads = `${coverBase(collectionId)}/uploads`;
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
      apiRequest(`${one(uploadId)}/complete`, { method: 'POST', schema: collectionSchema, signal }),
    cancel: (uploadId) => apiRequest(one(uploadId), { method: 'DELETE' }),
  };
}

/** Makes a guest's PHOTO frame the cover (a copy: deleting the frame later keeps the cover). */
export const setCoverFromFrame = (id: string, contentItemId: string): Promise<Collection> =>
  apiRequest(`${coverBase(id)}/from-frame`, {
    method: 'POST',
    body: { contentItemId },
    schema: collectionSchema,
  });

/** Back to the initials tile. Idempotent. */
export const removeCover = (id: string): Promise<void> =>
  apiRequest(coverBase(id), { method: 'DELETE' });
