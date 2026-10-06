'use client';

// Design (V1 «Графіт», owner 2026-10-06; DESIGN-SYSTEM.md §0.8):
// - The h1 «Колекції» with the usage in one quiet line under it: active collections and storage,
//   numbers in mono, each with a thin meter (decorative; the words carry it). One indigo
//   «Нова колекція» on the right.
// - One toolbar row: «Усі / Активні / Архів» with counts (a segmented control, the thumb slides),
//   the search (in the browser, over the loaded collections), the sort and «Таблиця / Плитки».
//   Counts are of what is loaded; a list with more pages says «50+».
// - «Таблиця» (the default) is a dense 64px-row table; «Плитки» the cards in a grid. The choice is
//   remembered in this browser (localStorage, read after mount: the first paint is the table).
//   Phones always get the cards and no toggle.
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
import { Images, LayoutGrid, Plus, Rows3, Search, SearchX } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import {
  type ReactNode,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { collectionsListKey, fetchUsage, listCollections, USAGE_KEY } from '@/api/collections';
import { useMediaQuery } from '@/components/use-media-query';
import { formatBytes } from '@/format/bytes';
import { CollectionCard } from './collection-card';
import { CollectionRow, CollectionTableHeader, TABLE_COLUMNS } from './collection-row';
import {
  browserStorage,
  type DashboardView,
  DEFAULT_DASHBOARD_VIEW,
  readDashboardView,
  writeDashboardView,
} from './dashboard-view';
import {
  type CollectionFilter as Filter,
  type CollectionSort as Sort,
  COLLECTION_FILTERS as FILTERS,
  COLLECTION_SORTS as SORTS,
  visibleCollections,
} from './collection-filters';
import { CreateCollectionDialog } from './create-collection-dialog';
import { meterPercent } from './usage-meter';

// The view this tab chose, so a storage that cannot keep it (private windows) still switches.
let chosenView: DashboardView | null = null;
const viewListeners = new Set<() => void>();

/**
 * The «Таблиця / Плитки» choice: the remembered one in this browser, the table on the server and
 * while hydrating (the list itself only renders once its data arrives in the browser).
 */
function useDashboardView(): [DashboardView, (view: DashboardView) => void] {
  const view = useSyncExternalStore(
    (onChange) => {
      viewListeners.add(onChange);
      return () => viewListeners.delete(onChange);
    },
    () => chosenView ?? readDashboardView(browserStorage),
    () => DEFAULT_DASHBOARD_VIEW,
  );
  const change = (next: DashboardView) => {
    chosenView = next;
    writeDashboardView(browserStorage, next);
    for (const listener of viewListeners) listener();
  };
  return [view, change];
}

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
  const format = useFormatter();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [query, setQuery] = useState('');
  // Typing stays responsive; the list follows a moment later.
  const deferredQuery = useDeferredValue(query);
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: fetchUsage });
  // Phones always get the cards; elsewhere the remembered view (the table until it is read).
  const phone = useMediaQuery('(max-width: 47.9375rem)');
  const [view, changeView] = useDashboardView();
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
        className="sm:items-center"
        description={
          slots === undefined || usage.data === undefined ? (
            // Holds the line's height until usage arrives.
            <span aria-hidden="true" className="invisible text-[0.875rem]">
              {t('usage', { used: 0, limit: 0 })}
            </span>
          ) : (
            <UsageLine
              collections={t('usage', { used: slots.used, limit: slots.limit })}
              slots={slots}
              storage={t('storageUsage', {
                used: formatBytes(format.number, usage.data.storage.usedBytes),
                limit: formatBytes(format.number, usage.data.storage.limitBytes),
              })}
              bytes={{
                used: usage.data.storage.usedBytes,
                limit: usage.data.storage.limitBytes,
              }}
            />
          )
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
        // The shapes of the toolbar and the table (cards on phones), so nothing jumps when the
        // list arrives; shown only after 180ms.
        <div className="loading-delayed grid gap-4" aria-busy="true">
          <span role="status" className="sr-only">
            {t('loading')}
          </span>
          <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
            <Skeleton className="h-11 w-full rounded-[7px] md:h-9 md:w-72" />
            <Skeleton className="h-11 w-full md:ml-auto md:h-9 md:w-80" />
          </div>
          <div className="overflow-hidden rounded-sheet border bg-card shadow-card">
            <div className="hidden h-9 bg-subtle md:block" />
            {[0, 1, 2, 3].map((key) => (
              <div
                key={key}
                className="flex min-h-[4.75rem] items-center gap-3 border-t px-4 py-3.5 first:border-t-0 md:first:border-t"
              >
                <Skeleton className="size-11 shrink-0 rounded-control" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-2/3 max-w-72" />
                  <Skeleton className="h-3.5 w-1/2 max-w-52" />
                </div>
                <Skeleton className="hidden h-[1.375rem] w-28 md:block" />
              </div>
            ))}
          </div>
        </div>
      ) : empty ? (
        <EmptyDashboard onCreate={openCreate} />
      ) : (
        <section
          aria-labelledby="collections-list"
          className="grid grid-cols-[minmax(0,1fr)] gap-4"
        >
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
            view={phone ? null : view}
            onViewChange={changeView}
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
          ) : phone ? (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" aria-label={t(`filter.${filter}`)}>
              {shown.map((collection) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} />
                </li>
              ))}
            </ul>
          ) : view === 'tiles' ? (
            <ul
              key="tiles"
              data-slot="collections-tiles"
              className="grid grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-[var(--duration-base)]"
              aria-label={t(`filter.${filter}`)}
            >
              {shown.map((collection) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} layout="tile" />
                </li>
              ))}
            </ul>
          ) : (
            <div
              key="table"
              data-slot="collections-table"
              className="@container/table rounded-sheet border bg-card shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-[var(--duration-base)]"
            >
              <div className={TABLE_COLUMNS}>
                <CollectionTableHeader />
                <ul aria-label={t(`filter.${filter}`)}>
                  {shown.map((collection) => (
                    <CollectionRow key={collection.id} collection={collection} />
                  ))}
                </ul>
              </div>
            </div>
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
 * The toolbar (V1): the status filter as a segmented control with counts, the search, the sort
 * and the view toggle, on one row from `lg` (the search pushed right). Phones: the search and
 * the sort, then the filter at full width; no view toggle (`view` null).
 */
function Toolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
  view,
  onViewChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  counts: Record<Filter, string>;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  view: DashboardView | null;
  onViewChange: (view: DashboardView) => void;
}) {
  const t = useTranslations('collections');
  const searchId = useId();
  const sortId = useId();
  return (
    <div
      data-slot="collections-toolbar"
      className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch"
    >
      <ToggleGroup
        variant="segmented"
        aria-label={t('filterLabel')}
        value={filter}
        onValueChange={(value) => onFilterChange(value as Filter)}
        className="max-md:order-last max-md:w-full"
      >
        {FILTERS.map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {t(`filter.${value}`)}
            <span className="ml-0.5 type-data text-muted-foreground">{counts[value]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex min-w-0 items-center gap-2 md:ml-auto">
        <div className="relative min-w-0 flex-1 md:w-52 md:flex-none xl:w-64">
          <label htmlFor={searchId} className="sr-only">
            {t('search')}
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(value) => onSortChange(value as Sort)}>
          <SelectTrigger aria-labelledby={sortId} className="w-auto shrink-0 gap-1.5">
            <span id={sortId} className="text-muted-foreground max-xl:sr-only">
              {t('sortLabel')}
            </span>
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
        {view === null ? null : (
          <>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
            <ToggleGroup
              variant="segmented"
              aria-label={t('view.label')}
              value={view}
              onValueChange={(value) => onViewChange(value as DashboardView)}
            >
              <ToggleGroupItem value="table" icon={<Rows3 />}>
                {t('view.table')}
              </ToggleGroupItem>
              <ToggleGroupItem value="tiles" icon={<LayoutGrid />}>
                {t('view.tiles')}
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        )}
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

/** Digits (with their group and decimal separators) in mono; the words stay in Golos Text. */
function monoDigits(text: string): ReactNode[] {
  return text.split(/(\d[\d\s.,]*\d|\d)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="font-mono text-xs font-medium text-foreground tabular-nums">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** A thin decorative meter beside a usage figure: the share used, in the accent. */
function Meter({ used, limit }: { used: number; limit: number }) {
  return (
    <span aria-hidden="true" className="h-1 w-14 overflow-hidden rounded-full bg-track">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${meterPercent(used, limit)}%` }}
      />
    </span>
  );
}

/**
 * «2 з 3 активних колекцій ▬ | 3,2 ГБ з 20 ГБ ▬»: the limits as one quiet line, the numbers in
 * mono, each with a meter. The sentence is the information; the meters only show it.
 */
function UsageLine({
  collections,
  storage,
  slots,
  bytes,
}: {
  collections: string;
  storage: string;
  slots: { used: number; limit: number };
  bytes: { used: number; limit: number };
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.875rem]">
      <span className="inline-flex items-center gap-2">
        <span>{monoDigits(collections)}</span>
        <Meter {...slots} />
      </span>
      <span aria-hidden="true" className="h-3 w-px bg-border-strong max-sm:hidden" />
      <span className="inline-flex items-center gap-2">
        <span>{monoDigits(storage)}</span>
        <Meter {...bytes} />
      </span>
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
