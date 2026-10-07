import { type Collection, collectionDisplayStatus } from '@stepler/contracts';

/**
 * The dashboard's «Стан» options (owner remark S2, 2026-10-06), in the menu's order, each one a
 * display status (`collectionDisplayStatus`): a blocked collection is «Заблоковані» whatever its
 * own status, so «В архіві» never also lists it. Nothing checked = every collection.
 */
export const COLLECTION_STATE_FILTERS = ['active', 'archived', 'blocked'] as const;
export type CollectionStateFilter = (typeof COLLECTION_STATE_FILTERS)[number];
export type CollectionSort = 'newest' | 'oldest' | 'title' | 'largest' | 'smallest';
export const COLLECTION_SORTS: readonly CollectionSort[] = [
  'newest',
  'oldest',
  'title',
  'largest',
  'smallest',
];

/** The option a collection falls under; `DELETING` never reaches the owner, so it has none. */
export function stateFilterOf(collection: Collection): CollectionStateFilter | null {
  switch (collectionDisplayStatus(collection)) {
    case 'ACTIVE':
      return 'active';
    case 'ARCHIVED':
      return 'archived';
    case 'BLOCKED':
      return 'blocked';
    case 'DELETING':
      return null;
  }
}

/** Every `?state=…` value, deduped and in the menu's order; unknown ones are dropped. */
export function statesFromParams(values: readonly string[]): CollectionStateFilter[] {
  const chosen = new Set(values);
  return COLLECTION_STATE_FILTERS.filter((filter) => chosen.has(filter));
}

/** What each option would show, over the loaded collections. */
export function stateCounts(
  active: readonly Collection[],
  archived: readonly Collection[],
): Record<CollectionStateFilter, number> {
  const counts: Record<CollectionStateFilter, number> = { active: 0, archived: 0, blocked: 0 };
  for (const collection of [...active, ...archived]) {
    const filter = stateFilterOf(collection);
    if (filter !== null) counts[filter] += 1;
  }
  return counts;
}

/**
 * The dashboard's cards: the chosen states (OR between them; none = all), titles containing the
 * search (case-insensitive, in the page's locale), in the chosen order (date, title or the
 * content's size). Runs in the browser over the loaded collections.
 */
export function visibleCollections(
  active: readonly Collection[],
  archived: readonly Collection[],
  {
    states,
    query,
    sort,
    locale,
  }: {
    states: readonly CollectionStateFilter[];
    query: string;
    sort: CollectionSort;
    locale: string;
  },
): Collection[] {
  const chosen = new Set<CollectionStateFilter | null>(states);
  const pool = [...active, ...archived].filter(
    (collection) => states.length === 0 || chosen.has(stateFilterOf(collection)),
  );
  const needle = query.trim().toLocaleLowerCase(locale);
  const found =
    needle === ''
      ? pool
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
