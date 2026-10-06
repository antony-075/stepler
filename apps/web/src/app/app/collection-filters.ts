import type { Collection } from '@stepler/contracts';

export type CollectionFilter = 'all' | 'active' | 'archived';
export type CollectionSort = 'newest' | 'oldest' | 'title' | 'largest' | 'smallest';
export const COLLECTION_FILTERS: readonly CollectionFilter[] = ['all', 'active', 'archived'];
export const COLLECTION_SORTS: readonly CollectionSort[] = [
  'newest',
  'oldest',
  'title',
  'largest',
  'smallest',
];

/**
 * The dashboard's cards: the chosen status, titles containing the search (case-insensitive, in
 * the page's locale), in the chosen order (date, title or the content's size). Runs in the browser over the loaded collections.
 */
export function visibleCollections(
  active: readonly Collection[],
  archived: readonly Collection[],
  {
    filter,
    query,
    sort,
    locale,
  }: { filter: CollectionFilter; query: string; sort: CollectionSort; locale: string },
): Collection[] {
  const pool =
    filter === 'active' ? active : filter === 'archived' ? archived : [...active, ...archived];
  const needle = query.trim().toLocaleLowerCase(locale);
  const found =
    needle === ''
      ? [...pool]
      : pool.filter((collection) => collection.title.toLocaleLowerCase(locale).includes(needle));
  const created = (collection: Collection) => Date.parse(collection.createdAt);
  return found.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, locale, { sensitivity: 'base' });
    // By the content's size (owner 2026-10-06); equal sizes keep the newest first.
    if (sort === 'largest' || sort === 'smallest') {
      const bySize =
        sort === 'largest' ? b.storageBytes - a.storageBytes : a.storageBytes - b.storageBytes;
      return bySize !== 0 ? bySize : created(b) - created(a);
    }
    return sort === 'newest' ? created(b) - created(a) : created(a) - created(b);
  });
}
