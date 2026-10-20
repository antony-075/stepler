import {
  adminContentIdsSchema,
  adminContentDetailSchema,
  adminContentItemSchema,
  adminContentPageSchema,
  type AdminContentSort,
  bulkDeleteContentResponseSchema,
  type BulkDeleteContentResponse,
  contentCountsSchema,
  type ContentKind,
  type ContentState,
} from '@stepler/contracts';
import { apiRequest } from './client';
import { collectionKey } from './collections';

// The admin's view of a collection's frames (owner-scoped by the API). Keys live under the
// collection's key, so any collection change refetches them too.

export const contentListKey = (
  collectionId: string,
  kind: ContentKind | undefined,
  sort: AdminContentSort,
  states: readonly ContentState[] = [],
) =>
  [
    ...collectionKey(collectionId),
    'content',
    kind ?? 'all',
    states.length === 0 ? 'any' : [...states].sort().join('+'),
    sort,
  ] as const;

/** Every list of the collection, whatever the filter and order. */
export const contentListsKey = (collectionId: string) =>
  [...collectionKey(collectionId), 'content'] as const;

export const contentCountsKey = (collectionId: string) =>
  [...collectionKey(collectionId), 'content-counts'] as const;

export function listContent(
  collectionId: string,
  query: {
    kind?: ContentKind;
    sort: AdminContentSort;
    cursor?: string;
    limit?: number;
    /** The state filter (slice 9 F1): OR between states, ANDed with the kind. */
    states?: readonly ContentState[];
  },
) {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.kind !== undefined) params.set('kind', query.kind);
  for (const state of query.states ?? []) params.append('state', state);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const search = params.toString();
  return apiRequest(
    `/collections/${encodeURIComponent(collectionId)}/content${search === '' ? '' : `?${search}`}`,
    { schema: adminContentPageSchema },
  );
}

/**
 * «Вибрати всі»: every frame's id for the list's filters and order (at most 10 000), and how
 * many match in all.
 */
export function listContentIds(
  collectionId: string,
  query: { kind?: ContentKind; sort: AdminContentSort; states?: readonly ContentState[] },
) {
  const params = new URLSearchParams();
  if (query.kind !== undefined) params.set('kind', query.kind);
  for (const state of query.states ?? []) params.append('state', state);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  const search = params.toString();
  return apiRequest(
    `/collections/${encodeURIComponent(collectionId)}/content/ids${search === '' ? '' : `?${search}`}`,
    { schema: adminContentIdsSchema },
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

/** Up to 100 frames of one collection; safe to retry (deleted ones come back `alreadyDeleted`). */
export const bulkDeleteContent = (
  collectionId: string,
  ids: readonly string[],
): Promise<BulkDeleteContentResponse> =>
  apiRequest(`/collections/${encodeURIComponent(collectionId)}/content/bulk-delete`, {
    method: 'POST',
    body: { ids },
    schema: bulkDeleteContentResponseSchema,
  });

/** «Приховати від гостей» (slice 9): idempotent; returns the frame as the grid shows it. */
export const hideContent = (id: string) =>
  apiRequest(`/content/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
    schema: adminContentItemSchema,
  });

/** «Показати гостям»: only what the admin hid (`409 CONTENT_MODERATED` otherwise). */
export const unhideContent = (id: string) =>
  apiRequest(`/content/${encodeURIComponent(id)}/unhide`, {
    method: 'POST',
    schema: adminContentItemSchema,
  });

/** «Відхилити скарги»: clears the admin's mark; the operator still reviews them. */
export const dismissReports = (id: string): Promise<void> =>
  apiRequest(`/content/${encodeURIComponent(id)}/reports/dismiss`, { method: 'POST' });
