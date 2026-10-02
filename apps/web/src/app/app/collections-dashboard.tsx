'use client';

// Design (direction C, DESIGN-SYSTEM.md §6.5; the owner's reference 2026-10-02):
// - The h1 «Колекції», one line on what the page is for, then the live "{used} of {limit}
//   active collections" sentence after a row of small squares (filled = used), and one ink
//   «Нова колекція». The limit is a sentence, not a KPI.
// - A toolbar sheet: search by title (in the browser, over the loaded collections), status chips
//   with their counts («Усі / Активні / Архів») and the sort. Counts are of what is loaded; a
//   list with more pages says «50+».
// - Each collection is its own card (`CollectionCard`): cover, title, description, what guests
//   may add through the main link, date and link state; status, «⋯», «Посилання» and «QR-код»
//   on the right. Archived cards sit on the page itself (no fill), set apart by shape.
// - Empty is an invitation, centred: a tinted tile with an icon, a headline, one line, the only
//   «Нова колекція» on the page and three steps. A search or filter that finds nothing says so
//   and offers to clear it.

import type { CollectionStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { FRAME_TINT_CLASSES, type FrameTint } from '@stepler/ui/lib/frame-tints';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Images, Plus, Search, SearchX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { collectionsListKey, fetchUsage, listCollections, USAGE_KEY } from '@/api/collections';
import { CollectionCard } from './collection-card';
import {
  type CollectionFilter as Filter,
  type CollectionSort as Sort,
  COLLECTION_FILTERS as FILTERS,
  COLLECTION_SORTS as SORTS,
  visibleCollections,
} from './collection-filters';
import { collectionTint } from './collection-tint';
import { CreateCollectionDialog } from './create-collection-dialog';

function useCollectionList(status: CollectionStatus) {
  return useInfiniteQuery({
    queryKey: collectionsListKey(status),
    queryFn: ({ pageParam }) => listCollections(status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

type CollectionList = ReturnType<typeof useCollectionList>;

const itemsOf = (list: CollectionList) => list.data?.pages.flatMap((page) => page.items) ?? [];

export function CollectionsDashboard() {
  const t = useTranslations('collections');
  const locale = useLocale();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  // Typing stays responsive; the list follows a moment later.
  const deferredQuery = useDeferredValue(query);
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: fetchUsage });
  const active = useCollectionList('ACTIVE');
  const archived = useCollectionList('ARCHIVED');

  const slots = usage.data?.activeCollections;
  const activeItems = itemsOf(active);
  const archivedItems = itemsOf(archived);
  const loading = active.isPending || archived.isPending;
  const failed = active.isError || archived.isError;
  const empty = !loading && !failed && activeItems.length === 0 && archivedItems.length === 0;
  const shown = useMemo(
    () =>
      visibleCollections(activeItems, archivedItems, {
        filter,
        query: deferredQuery,
        sort,
        locale,
      }),
    [activeItems, archivedItems, filter, deferredQuery, sort, locale],
  );

  const openCreate = () => setCreateOpen(true);
  const counts: Record<Filter, string> = {
    all: count(
      activeItems.length + archivedItems.length,
      active.hasNextPage || archived.hasNextPage,
    ),
    active: count(activeItems.length, active.hasNextPage),
    archived: count(archivedItems.length, archived.hasNextPage),
  };

  return (
    <>
      <PageHeader
        size="compact"
        title={t('pageTitle')}
        description={
          <span className="grid gap-2">
            <span>{t('subtitle')}</span>
            {slots === undefined ? (
              // Holds the line's height until usage arrives.
              <span aria-hidden="true" className="invisible text-sm">
                {t('usage', { used: 0, limit: 0 })}
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <UsageSquares
                  used={slots.used}
                  limit={slots.limit}
                  tints={activeItems.map((collection) => collectionTint(collection.id))}
                />
                <span className="tabular-nums">
                  {t('usage', { used: slots.used, limit: slots.limit })}
                </span>
              </span>
            )}
          </span>
        }
        actions={
          // Empty, the invitation below holds the only "New collection"; loading, neither is known yet.
          loading || empty ? null : (
            <Button onClick={openCreate} className="w-full sm:w-auto">
              <Plus aria-hidden="true" />
              {t('new')}
            </Button>
          )
        }
      />

      {failed ? (
        <Alert
          variant="error"
          action={
            <Button
              variant="outline"
              onClick={() => {
                if (active.isError) void active.refetch();
                if (archived.isError) void archived.refetch();
              }}
            >
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : loading ? (
        <div className="grid gap-3" aria-busy="true">
          <span role="status" className="sr-only">
            {t('loading')}
          </span>
          <Skeleton className="h-[4.5rem] w-full rounded-sheet" />
          {[0, 1].map((key) => (
            <div
              key={key}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-sheet border bg-card p-4 shadow-card sm:gap-6 sm:p-5"
            >
              <Skeleton className="size-20 sm:size-32" />
              <div className="grid content-start gap-3">
                <Skeleton className="h-7 w-3/4 max-w-80" />
                <Skeleton className="h-5 w-1/2 max-w-56" />
                <Skeleton className="h-8 w-2/3 max-w-96" />
              </div>
            </div>
          ))}
        </div>
      ) : empty ? (
        <EmptyDashboard onCreate={openCreate} />
      ) : (
        <section aria-labelledby="collections-list" className="grid gap-3">
          <h2 id="collections-list" className="sr-only">
            {t(`filter.${filter}`)}
          </h2>
          <Toolbar
            query={query}
            onQueryChange={setQuery}
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            sort={sort}
            onSortChange={setSort}
          />
          {shown.length === 0 ? (
            <NothingFound
              filter={filter}
              query={deferredQuery}
              onClear={() => {
                setQuery('');
                setFilter('all');
              }}
            />
          ) : (
            <ul className="grid gap-3" aria-label={t(`filter.${filter}`)}>
              {shown.map((collection) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {filter === 'archived' ? null : <ShowMore list={active} label={t('showMore')} />}
            {filter === 'active' ? null : (
              <ShowMore list={archived} label={t('showMoreArchived')} />
            )}
          </div>
        </section>
      )}

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        atLimit={slots !== undefined && slots.used >= slots.limit}
        limit={slots?.limit}
      />
    </>
  );
}

/** "12", or "50+" while the list has more pages than are loaded. */
const count = (loaded: number, more: boolean): string => (more ? `${loaded}+` : String(loaded));

/**
 * Search, status chips and sort on one sheet. Phones: the search across the top, the chips
 * under it (they scroll inside themselves if a translation is long), the sort last at full
 * width. From `lg` all three on one line, the sort pushed to the right.
 */
function Toolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  counts: Record<Filter, string>;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
}) {
  const t = useTranslations('collections');
  const searchId = useId();
  const sortId = useId();
  return (
    <div
      data-slot="collections-toolbar"
      className="grid gap-3 rounded-sheet border bg-card p-3 shadow-card sm:p-4 lg:grid-cols-[minmax(0,22rem)_auto_auto] lg:items-center lg:gap-4"
    >
      <div className="relative min-w-0">
        <label htmlFor={searchId} className="sr-only">
          {t('search')}
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="pl-10"
        />
      </div>
      <div className="-mx-1 min-w-0 overflow-x-auto px-1 py-0.5 [scrollbar-width:thin]">
        <ToggleGroup
          aria-label={t('filterLabel')}
          value={filter}
          onValueChange={(value) => onFilterChange(value as Filter)}
        >
          {FILTERS.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(`filter.${value}`)}
              <span className="ml-1.5 type-data text-muted-foreground">{counts[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex min-w-0 items-center gap-3 lg:justify-self-end">
        <span id={sortId} className="shrink-0 text-sm text-muted-foreground">
          {t('sortLabel')}
        </span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as Sort)}>
          <SelectTrigger aria-labelledby={sortId} className="h-11 w-full min-w-44 lg:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`sort.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** A search or filter with no match: what was looked for, and a way back to everything. */
function NothingFound({
  filter,
  query,
  onClear,
}: {
  filter: Filter;
  query: string;
  onClear: () => void;
}) {
  const t = useTranslations('collections');
  const searching = query.trim() !== '';
  return (
    <div
      data-slot="collections-nothing-found"
      className="grid justify-items-center gap-3 rounded-sheet border border-dashed border-input px-5 py-10 text-center"
    >
      <SearchX aria-hidden="true" className="size-6 text-muted-foreground" />
      <p role="status" className="max-w-[48ch] text-pretty">
        {searching
          ? t('nothingFound', { query: query.trim() })
          : filter === 'archived'
            ? t('noArchived')
            : t('noActive')}
      </p>
      {searching || filter !== 'all' ? (
        <Button variant="outline" onClick={onClear}>
          {t('showAll')}
        </Button>
      ) : null}
    </div>
  );
}

function ShowMore({ list, label }: { list: CollectionList; label: string }) {
  if (!list.hasNextPage) return null;
  return (
    <Button
      variant="outline"
      className="justify-self-center"
      aria-disabled={list.isFetchingNextPage || undefined}
      onClick={() => {
        if (!list.isFetchingNextPage) void list.fetchNextPage();
      }}
    >
      {label}
    </Button>
  );
}

const USAGE_FREE = 'border-input';
const USAGE_UNKNOWN_TINT = 'border-foreground bg-foreground';
// At 12px the soft fill would vanish: a used slot is drawn in the tint's ink.
const USAGE_TINT: Record<FrameTint, string> = {
  sage: 'border-tint-sage-ink bg-tint-sage-ink',
  lavender: 'border-tint-lavender-ink bg-tint-lavender-ink',
  sand: 'border-tint-sand-ink bg-tint-sand-ink',
  sky: 'border-tint-sky-ink bg-tint-sky-ink',
};

/**
 * One small square per active-collection slot: a used slot in its collection's tint (ink until
 * the list arrives), a free one as an empty outline. The limit at a glance; the sentence next to
 * it says the same in words.
 */
function UsageSquares({
  used,
  limit,
  tints,
}: {
  used: number;
  limit: number;
  tints: readonly FrameTint[];
}) {
  return (
    <span aria-hidden="true" data-slot="usage-squares" className="inline-flex gap-1">
      {Array.from({ length: limit }, (_, index) => {
        const tint = tints[index];
        const tone =
          index >= used ? USAGE_FREE : tint === undefined ? USAGE_UNKNOWN_TINT : USAGE_TINT[tint];
        return <span key={index} className={cn('size-3 rounded-[1px] border', tone)} />;
      })}
    </span>
  );
}

const STEPS = ['create', 'share', 'collect'] as const;

// The step numbers pass 4.5:1 on their tint.
const STEP_TINTS: Record<(typeof STEPS)[number], FrameTint> = {
  create: 'lavender',
  share: 'sky',
  collect: 'sage',
};

/**
 * No collection yet: what a collection is, the one action, and how it works in three steps (a
 * real sequence, so numbered). Centred in its panel under the same mark an empty collection
 * shows (a tinted tile with an icon); nothing pretends to be content. Phones: one column with
 * the steps as rows; from `sm` the steps sit side by side.
 */
function EmptyDashboard({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('collections');
  return (
    <Panel
      data-slot="collections-empty"
      className="grid justify-items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:py-20"
    >
      <div className="grid max-w-[34rem] justify-items-center gap-6 text-center">
        <TintTile tint="lavender" size="lg">
          <Images aria-hidden="true" />
        </TintTile>
        <div className="grid gap-3">
          <h2 className="type-h2 [overflow-wrap:anywhere]">{t('emptyTitle')}</h2>
          <p className="text-pretty text-muted-foreground">{t('emptyText')}</p>
        </div>
        <Button onClick={onCreate} className="w-full sm:w-auto">
          <Plus aria-hidden="true" />
          {t('new')}
        </Button>
      </div>
      <ol
        aria-label={t('stepsLabel')}
        className="grid w-full max-w-3xl gap-4 border-t pt-8 sm:grid-cols-3 sm:gap-6"
      >
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center"
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-sheet border text-sm font-semibold tabular-nums',
                FRAME_TINT_CLASSES[STEP_TINTS[step]],
              )}
            >
              {index + 1}
            </span>
            <span className="max-w-[24ch] text-balance">{t(`steps.${step}`)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
