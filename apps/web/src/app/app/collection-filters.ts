import type { Collection } from '@stepler/contracts';

export type CollectionFilter = 'all' | 'active' | 'archived';
export type CollectionSort = 'newest' | 'oldest' | 'title';
export const COLLECTION_FILTERS: readonly CollectionFilter[] = ['all', 'active', 'archived'];
export const COLLECTION_SORTS: readonly CollectionSort[] = ['newest', 'oldest', 'title'];

/**
 * The dashboard's cards: the chosen status, titles containing the search (case-insensitive, in
 * the page's locale), in the chosen order. Runs in the browser over the loaded collections.
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
    return sort === 'newest' ? created(b) - created(a) : created(a) - created(b);
  });
}
