'use client';

// The collection's «Вміст» tab (DESIGN-SYSTEM.md §6.6; [C5], [C6], [O3]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - A tool, not a showcase: one toolbar row (type chips with counts, the order select), then the
//   contact sheet straight on the page (no white panel around it). Frames are large enough to
//   read (3 columns on a phone, about 170px on a desktop; 1–3 frames larger still); the admin
//   sees every number and the contributor's name.
// - A type no live link lets guests add, with nothing of it, is a locked chip with the reason
//   (owner review 2026-10-03); a type with frames always stays open.
// - Newest first by default (during an event the admin wants what just arrived); «За номером
//   кадру» for the archive view. Both, and the type, live in the URL (`?kind=text&sort=frame`),
//   and so does the open frame (`?frame=86`, Back closes the viewer).
// - The grid never moves under the admin's hand: new frames are counted in the background (every
//   15 s while this tab is shown) and announced in one quiet line with «Показати».
// - «Показати ще» is a button (keyboard and screen readers reach it; no scroll trap). Loading is
//   a still grid of placeholders; a failure is an inline alert with «Спробувати ще».
// - An empty collection keeps the calm tinted panel; an empty filter says what is missing and
//   offers «Показати все». Archived collections look the same: their frames are kept.

import type { AdminContentItem, AdminContentPage, Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
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
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import {
  contentCountsKey,
  contentListKey,
  contentListsKey,
  deleteContent,
  listContent,
} from '@/api/content';
import { collectionsListKey } from '@/api/collections';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { collectionTint } from '../../../collection-tint';
import {
  filterOf,
  frameFromParam,
  KIND_FILTERS,
  type KindFilter,
  kindFromParam,
  lockedFilters,
  sortFromParam,
} from './content-filters';
import { ContentViewer } from './content-viewer';
import { useNewContent } from './use-new-content';

const SORTS = ['newest', 'frame'] as const;

export function ContentTab({ collection }: { collection: Collection }) {
  const t = useTranslations('content');
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const sortId = useId();
  const kind = kindFromParam(params.get('kind'));
  const sort = sortFromParam(params.get('sort'));
  const frameNo = frameFromParam(params.get('frame'));
  const { counts, newCount, showNew, rebase } = useNewContent(collection.id);
  // Whether this page pushed `?frame=`: then closing goes Back, so Back never reopens it.
  const openedHere = useRef(false);

  const list = useInfiniteQuery({
    queryKey: contentListKey(collection.id, kind, sort),
    queryFn: ({ pageParam }) =>
      listContent(collection.id, {
        ...(kind === undefined ? {} : { kind }),
        sort,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AdminContentPage) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  // The same query as the «Посилання» tab: what live links let guests add locks empty chips.
  const links = useQuery({
    queryKey: guestLinksKey(collection.id),
    queryFn: () => listGuestLinks(collection.id),
  });
  const locked = lockedFilters(links.data?.items, counts.data);

  /** Updates the URL; `null` removes a parameter. */
  function navigate(changes: Record<string, string | null>, mode: 'push' | 'replace') {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const search = query.toString();
    const href = `/app/collections/${collection.id}${search === '' ? '' : `?${search}`}`;
    if (mode === 'push') router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  function openFrame(n: number) {
    openedHere.current = true;
    navigate({ frame: String(n) }, 'push');
  }

  function closeViewer() {
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      navigate({ frame: null }, 'replace');
    }
  }

  async function removeFrame(item: AdminContentItem) {
    await deleteContent(item.id);
    // Out of every loaded list at once; the rest of the grid stays where it is.
    queryClient.setQueriesData<InfiniteData<AdminContentPage>>(
      { queryKey: contentListsKey(collection.id) },
      (data) =>
        data === undefined
          ? data
          : {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((other) => other.id !== item.id),
              })),
            },
    );
    rebase();
    closeViewer();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contentCountsKey(collection.id) }),
      queryClient.invalidateQueries({ queryKey: collectionsListKey(collection.status) }),
    ]);
  }

  if (counts.data?.total === 0 && items.length === 0) {
    return <EmptyCollection collection={collection} />;
  }

  const filter = filterOf(kind);
  const countOf = (value: KindFilter) =>
    counts.data === undefined ? undefined : counts.data[value === 'all' ? 'total' : value];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* One toolbar row from md: chips left, the order right, both 36px (44px on touch) on one
          centre line. */}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 min-w-0 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ToggleGroup
            aria-label={t('filterLabel')}
            value={filter}
            onValueChange={(value) =>
              navigate({ kind: value === 'all' ? null : value, frame: null }, 'replace')
            }
          >
            {KIND_FILTERS.map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                count={countOf(value)}
                disabledReason={
                  value !== 'all' && locked.has(value) && filter !== value
                    ? t(`filterLocked.${value}`)
                    : undefined
                }
              >
                {t(`filter.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span id={sortId} className="shrink-0 text-sm text-muted-foreground">
            {t('sortLabel')}
          </span>
          <Select
            value={sort}
            onValueChange={(value) =>
              navigate({ sort: value === 'frame' ? 'frame' : null, frame: null }, 'replace')
            }
          >
            <SelectTrigger
              aria-labelledby={sortId}
              className="h-11 w-full min-w-44 md:h-9 md:w-52 pointer-coarse:h-11"
            >
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

      <div aria-live="polite" className="empty:hidden">
        {newCount > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 text-[0.9375rem]">
            <span>{t('newFrames', { count: newCount })}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-link underline underline-offset-4"
              onClick={showNew}
            >
              {t('showNew')}
            </Button>
          </p>
        ) : null}
      </div>

      {list.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <div className="grid grid-cols-3 gap-px sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
      ) : list.isError ? (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void list.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : items.length === 0 && filter === 'all' ? (
        <EmptyCollection collection={collection} />
      ) : items.length === 0 && filter !== 'all' ? (
        <Panel className="py-6">
          <EmptyState
            headingLevel={3}
            title={t(`emptyFilter.${filter}`)}
            description={t('emptyFilterText')}
            action={
              <Button variant="outline" onClick={() => navigate({ kind: null }, 'replace')}>
                {t('showAll')}
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4">
          <FrameGrid ariaLabel={t('listLabel')}>
            {items.map((item) => (
              <div key={item.id} data-frame={item.frameNo}>
                <AdminFrame item={item} onOpen={() => openFrame(item.frameNo)} />
              </div>
            ))}
          </FrameGrid>
          {list.hasNextPage ? (
            <Button
              variant="outline"
              className="justify-self-center"
              aria-disabled={list.isFetchingNextPage || undefined}
              onClick={() => {
                if (!list.isFetchingNextPage) void list.fetchNextPage();
              }}
            >
              {t('loadMore')}
            </Button>
          ) : null}
        </div>
      )}

      <ContentViewer
        items={items}
        frameNo={frameNo}
        onNavigate={(n) => navigate({ frame: String(n) }, 'replace')}
        onClose={closeViewer}
        onDelete={removeFrame}
      />
    </div>
  );
}

function AdminFrame({ item, onOpen }: { item: AdminContentItem; onOpen: () => void }) {
  const t = useTranslations('content');
  const format = useFormatter();
  const time = format.dateTime(new Date(item.createdAt), { hour: '2-digit', minute: '2-digit' });
  const name = item.contributorName ?? t('noName');
  const accessibleName = t('frameName', {
    number: item.frameNo,
    kind: t(`kind.${item.kind}`),
    time,
    name,
  });
  if (item.kind === 'TEXT') {
    return (
      <Frame
        kind="text"
        number={item.frameNo}
        time={time}
        text={item.text ?? ''}
        name={name}
        accessibleName={accessibleName}
        onOpen={onOpen}
      />
    );
  }
  return (
    <Frame
      kind="pending-preview"
      number={item.frameNo}
      time={time}
      placeholderLabel={t('pendingPreview')}
      accessibleName={accessibleName}
      onOpen={onOpen}
    />
  );
}

/**
 * Nothing added yet: one quiet centred panel, a tile in the collection's tint, what will appear
 * and, unless archived, how (sharing is per link, on the «Посилання» tab).
 */
function EmptyCollection({ collection }: { collection: Collection }) {
  const t = useTranslations('collection');
  const archived = collection.status === 'ARCHIVED';
  return (
    <Panel
      data-slot="collection-empty"
      // A flex column centred on its cross axis: centred in the card at every width.
      className="items-center justify-center gap-5 px-5 py-14 text-center sm:px-8 sm:py-20 lg:py-24"
    >
      <TintTile tint={collectionTint(collection.id)} size="lg">
        <ImagePlus aria-hidden="true" />
      </TintTile>
      <div className="grid max-w-[44ch] gap-2">
        <h3 className="type-h3 [overflow-wrap:anywhere]">{t('contentEmpty')}</h3>
        {/* Archived, guests can't add anything: the notice above says so. */}
        {archived ? null : (
          <p className="text-pretty text-muted-foreground">{t('contentEmptyText')}</p>
        )}
      </div>
    </Panel>
  );
}
