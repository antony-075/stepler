import {
  adminContentDetailSchema,
  adminContentPageSchema,
  type AdminContentSort,
  contentCountsSchema,
  type ContentKind,
} from '@stepler/contracts';
import { apiRequest } from './client';
import { collectionKey } from './collections';

// The admin's view of a collection's frames (owner-scoped by the API). Keys live under the
// collection's key, so any collection change refetches them too.

export const contentListKey = (
  collectionId: string,
  kind: ContentKind | undefined,
  sort: AdminContentSort,
) => [...collectionKey(collectionId), 'content', kind ?? 'all', sort] as const;

/** Every list of the collection, whatever the filter and order. */
export const contentListsKey = (collectionId: string) =>
  [...collectionKey(collectionId), 'content'] as const;

export const contentCountsKey = (collectionId: string) =>
  [...collectionKey(collectionId), 'content-counts'] as const;

export function listContent(
  collectionId: string,
  query: { kind?: ContentKind; sort: AdminContentSort; cursor?: string },
) {
  const params = new URLSearchParams();
  if (query.kind !== undefined) params.set('kind', query.kind);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const search = params.toString();
  return apiRequest(
    `/collections/${encodeURIComponent(collectionId)}/content${search === '' ? '' : `?${search}`}`,
    { schema: adminContentPageSchema },
  );
}

export const contentCounts = (collectionId: string) =>
  apiRequest(`/collections/${encodeURIComponent(collectionId)}/content/counts`, {
    schema: contentCountsSchema,
  });

export const getContent = (id: string) =>
  apiRequest(`/content/${encodeURIComponent(id)}`, { schema: adminContentDetailSchema });

/** Idempotent: an already deleted frame is a success too. */
export const deleteContent = (id: string): Promise<void> =>
  apiRequest(`/content/${encodeURIComponent(id)}`, { method: 'DELETE' });
