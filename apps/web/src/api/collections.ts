import {
  type Collection,
  collectionListResponseSchema,
  collectionSchema,
  type CollectionStatus,
  type CreateCollectionRequest,
  type UpdateCollectionRequest,
  usageResponseSchema,
} from '@stepler/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
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
  apiRequest(`/collections/${encodeURIComponent(id)}`, { schema: collectionSchema });

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
