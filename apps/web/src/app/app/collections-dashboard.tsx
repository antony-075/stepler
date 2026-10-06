'use client';

// Design (V1 «Графіт», owner 2026-10-06; DESIGN-SYSTEM.md §0.8):
// - The h1 «Колекції» with the usage in one quiet line under it: active collections and storage,
//   numbers in mono, each with a thin meter (decorative; the words carry it). One indigo
//   «Нова колекція» on the right.
// - One toolbar row: the «Стан» filter (owner remark S2, 2026-10-06: a menu of checkboxes like
//   «Вміст»'s, OR between «Активні / В архіві / Заблоковані», `?state=` in the URL, mono counts,
//   «Скинути» at the foot; nothing checked = all), the search (in the browser, over the loaded
//   collections), the sort and «Таблиця / Плитки». Counts are of what is loaded; a list with
//   more pages says «50+». The list fades in again when the filter changes.
// - «Таблиця» (the default) is a dense 64px-row table; «Плитки» the cards in a grid. The choice is
//   remembered in this browser (localStorage, read after mount: the first paint is the table).
//   Phones always get the cards and no toggle.
// - Empty is an invitation, centred: a tinted tile with an icon, a headline, one line, the only
//   «Нова колекція» on the page and three steps. A search or filter that finds nothing says so
//   and offers to clear it.

import type { Collection, CollectionStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
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
import {
  Archive,
  ChevronDown,
  Images,
  LayoutGrid,
  Plus,
  Rows3,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  type CollectionSort as Sort,
  type CollectionStateFilter as StateFilter,
  COLLECTION_SORTS as SORTS,
  COLLECTION_STATE_FILTERS as STATE_FILTERS,
  stateCounts,
  statesFromParams,
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  // The «Стан» filter lives in the URL (`?state=active&state=blocked`), so it survives a reload
  // and can be shared, as the content tab's does.
  const states = useMemo(() => statesFromParams(params.getAll('state')), [params]);
  const setStates = (next: readonly StateFilter[]) => {
    const query = new URLSearchParams(params.toString());
    query.delete('state');
    for (const one of next) query.append('state', one);
    const search = query.toString();
    router.replace(`${pathname}${search === '' ? '' : `?${search}`}`, { scroll: false });
  };
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
        states,
        query: deferredQuery,
        sort,
        locale,
      }),
    [activeItems, archivedItems, states, deferredQuery, sort, locale],
  );

  // With nothing checked, the archive comes after the active ones under «Архів · N» (owner
  // 2026-10-06); presentation only: the sort holds within each group. A checked state has no
  // heading (S2). A blocked archived collection is blocked first, so it stays with the blocked.
  const isArchived = (collection: Collection) =>
    collection.status === 'ARCHIVED' && collection.blocked === null;
  const archivedShown = shown.filter(isArchived).length;
  const grouped: (Collection | typeof ARCHIVE_GROUP)[] =
    states.length === 0 && archivedShown > 0
      ? [
          ...shown.filter((collection) => !isArchived(collection)),
          ARCHIVE_GROUP,
          ...shown.filter(isArchived),
        ]
      : shown;
  // Remounts the list when the filter changes, so it fades in again (the segmented thumb's
  // motion before S2).
  const listKey = states.join('+');

  const openCreate = () => setCreateOpen(true);
  const loadedCounts = stateCounts(activeItems, archivedItems);
  const counts: Record<StateFilter, string> = {
    active: count(loadedCounts.active, active.hasNextPage),
    archived: count(loadedCounts.archived, archived.hasNextPage),
    // A blocked collection may sit in either list.
    blocked: count(loadedCounts.blocked, active.hasNextPage || archived.hasNextPage),
  };
  // «Показати ще» per list: the active list holds active and blocked ones, the archive list
  // archived and blocked ones.
  const wantsActiveList = states.length === 0 || states.some((state) => state !== 'archived');
  const wantsArchiveList = states.length === 0 || states.some((state) => state !== 'active');

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
            {t('pageTitle')}
          </h2>
          <Toolbar
            query={query}
            onQueryChange={setQuery}
            states={states}
            onStatesChange={setStates}
            counts={counts}
            sort={sort}
            onSortChange={setSort}
            view={phone ? null : view}
            onViewChange={changeView}
          />
          {shown.length === 0 ? (
            <NothingFound
              states={states}
              query={deferredQuery}
              onClear={() => {
                setQuery('');
                setStates([]);
              }}
            />
          ) : phone ? (
            <ul
              key={`cards-${listKey}`}
              className="grid grid-cols-[minmax(0,1fr)] gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-[var(--duration-base)]"
              aria-label={t('pageTitle')}
            >
              {grouped.map((collection) =>
                collection === ARCHIVE_GROUP ? (
                  <GroupHeading key="archive" count={archivedShown} className="mt-3" />
                ) : (
                  <li key={collection.id}>
                    <CollectionCard collection={collection} />
                  </li>
                ),
              )}
            </ul>
          ) : view === 'tiles' ? (
            <ul
              key={`tiles-${listKey}`}
              data-slot="collections-tiles"
              className="grid grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-[var(--duration-base)]"
              aria-label={t('pageTitle')}
            >
              {grouped.map((collection) =>
                collection === ARCHIVE_GROUP ? (
                  <GroupHeading
                    key="archive"
                    count={archivedShown}
                    className="col-span-full mt-3"
                  />
                ) : (
                  <li key={collection.id}>
                    <CollectionCard collection={collection} layout="tile" />
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div
              key={`table-${listKey}`}
              data-slot="collections-table"
              className="@container/table rounded-sheet border bg-card shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-[var(--duration-base)]"
            >
              <div className={TABLE_COLUMNS}>
                <CollectionTableHeader />
                <ul aria-label={t('pageTitle')}>
                  {grouped.map((collection) =>
                    collection === ARCHIVE_GROUP ? (
                      <GroupHeading
                        key="archive"
                        count={archivedShown}
                        className="border-t bg-subtle px-4 py-2"
                      />
                    ) : (
                      <CollectionRow key={collection.id} collection={collection} />
                    ),
                  )}
                </ul>
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {wantsActiveList ? <ShowMore list={active} label={t('showMore')} /> : null}
            {wantsArchiveList ? <ShowMore list={archived} label={t('showMoreArchived')} /> : null}
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

/** Where «Усі» starts the archive group. */
const ARCHIVE_GROUP = Symbol('archive-group');

/** «Архів · 4»: the archive group's heading inside the list (a quiet line, not a control). */
function GroupHeading({ count, className }: { count: number; className?: string }) {
  const t = useTranslations('collections');
  return (
    <li data-slot="collections-group" className={className}>
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Archive aria-hidden="true" className="size-3.5" />
        {t('archiveGroup', { count })}
      </h3>
    </li>
  );
}

/** "12", or "50+" while the list has more pages than are loaded. */
const count = (loaded: number, more: boolean): string => (more ? `${loaded}+` : String(loaded));

/**
 * The toolbar (V1): the «Стан» filter (a menu of checkboxes with counts, S2), the search, the
 * sort and the view toggle, on one row from `lg` (the search pushed right). Phones: the search
 * and the sort, then the filter at full width (44px); no view toggle (`view` null).
 */
function Toolbar({
  query,
  onQueryChange,
  states,
  onStatesChange,
  counts,
  sort,
  onSortChange,
  view,
  onViewChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  states: readonly StateFilter[];
  onStatesChange: (states: readonly StateFilter[]) => void;
  counts: Record<StateFilter, string>;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  view: DashboardView | null;
  onViewChange: (view: DashboardView) => void;
}) {
  const t = useTranslations('collections');
  const searchId = useId();
  const sortId = useId();
  const chosen =
    states.length === 0
      ? t('state.all')
      : states.length === 1
        ? t(`state.${states[0]!}`)
        : t('state.selected', { count: states.length });
  return (
    <div
      data-slot="collections-toolbar"
      className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch"
    >
      {/* Non-modal and open while ticking (OR between states), as the content tab's «Стан». */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-11 w-full min-w-0 shrink justify-between font-normal md:h-9 md:w-auto md:min-w-44 pointer-coarse:h-11 max-md:order-last"
          >
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{t('state.prefix')}</span> {chosen}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuLabel>{t('state.label')}</DropdownMenuLabel>
          {STATE_FILTERS.map((value) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={states.includes(value)}
              // Stays open: the admin usually ticks more than one.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(next) =>
                onStatesChange(
                  STATE_FILTERS.filter((other) =>
                    other === value ? next === true : states.includes(other),
                  ),
                )
              }
            >
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">
                {t(`state.${value}`)}
              </span>
              <span className="type-data ml-3 text-muted-foreground tabular-nums">
                {counts[value]}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          {states.length === 0 ? null : (
            <>
              <DropdownMenuSeparator />
              {/* The same gutter as the checkboxes, so the labels line up. */}
              <DropdownMenuItem
                className="pl-9 md:pointer-fine:pl-9"
                onSelect={() => onStatesChange([])}
              >
                <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center">
                  <X aria-hidden="true" />
                </span>
                {t('state.clear')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
  states,
  query,
  onClear,
}: {
  states: readonly StateFilter[];
  query: string;
  onClear: () => void;
}) {
  const t = useTranslations('collections');
  const searching = query.trim() !== '';
  const only = states.length === 1 ? states[0] : undefined;
  return (
    <div
      data-slot="collections-nothing-found"
      className="grid justify-items-center gap-3 rounded-sheet border border-dashed border-input px-5 py-10 text-center"
    >
      <SearchX aria-hidden="true" className="size-6 text-muted-foreground" />
      <p role="status" className="max-w-[48ch] text-pretty">
        {searching
          ? t('nothingFound', { query: query.trim() })
          : only === 'archived'
            ? t('noArchived')
            : only === 'active'
              ? t('noActive')
              : t('state.empty')}
      </p>
      {searching || states.length > 0 ? (
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
