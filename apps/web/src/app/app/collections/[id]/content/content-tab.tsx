'use client';

// The collection's «Вміст» tab (DESIGN-SYSTEM.md §6.6; [C5], [C6], [O3]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - A tool, not a showcase: one toolbar row (type chips with counts, the order select), then the
//   photo grid of borderless tiles straight on the page (owner remark 62). Tiles are large enough to
//   read (3 columns on a phone, about 170px on a desktop; 1–3 frames larger still); the admin
//   sees every number and the contributor's name.
// - A type no live link lets guests add, with nothing of it, is a locked chip with the reason
//   (owner review 2026-10-03); a type with frames always stays open.
// - «Оновити» beside the order (there is no push): counts, links and the list from its first
//   page, in place; the icon spins meanwhile and «Оновлено» is announced when done.
// - Newest first by default (during an event the admin wants what just arrived); «За номером
//   кадру» for the archive view. Both, and the type, live in the URL (`?kind=text&sort=frame`),
//   and so does the open frame (`?frame=86`, Back closes the viewer).
// - The grid never moves under the admin's hand: new frames are counted in the background (every
//   15 s while this tab is shown) and announced in one quiet line with «Показати».
// - «Показати ще» is a button (keyboard and screen readers reach it; no scroll trap). Loading is
//   a still grid of placeholders; a failure is an inline alert with «Спробувати ще».
// - Files: documents are a type tile with the file name and size; photos and videos show their
//   480px thumbnail (videos with ▶ and the duration), never the original. Until the worker has
//   made it, «Готується прев’ю», swapped in place within about 10 s of it being ready (only the
//   waiting frames are asked for again, so nothing else moves); if it cannot be made, the type
//   tile (a photo: «Прев’ю недоступне»; a video: ▶ on grey), and the viewer still downloads it.
// - Multi-select [C7] (§5.13): «Вибрати» in the toolbar (or `x` on a focused frame, or a 500ms
//   long-press on touch) turns the frames into toggles with a visible check on each; Shift+click
//   selects a range; «Вибрати все завантажене» takes every loaded frame. The `SelectionBar` sticks
//   to the bottom of the grid column («Вибрано 3», «Видалити», «Скасувати вибір»; Escape too),
//   and «Видалити» asks with the count before one bulk request per 100 frames. Changing the type
//   or the order clears the selection.
// - An empty collection keeps the calm tinted panel; an empty filter says what is missing and
//   offers «Показати все». Archived collections look the same: their frames are kept.

import type { AdminContentItem, AdminContentPage, Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { Panel } from '@stepler/ui/components/panel';
import { SelectionBar } from '@stepler/ui/components/selection-bar';
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
import { useToast } from '@stepler/ui/components/toast';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CheckSquare, ImagePlus, ListChecks, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@stepler/ui/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type MouseEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import {
  bulkDeleteContent,
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
import { chunks, rangeSelect, toggle } from './selection';
import { documentType } from '@/media/viewer-stage';
import { useNewContent } from './use-new-content';
import { refreshFrames, usePendingPreviews } from './use-pending-previews';
import { formatBytes, formatDuration } from '@/format/bytes';
import { MediaImg } from '@/media/media-img';
import { gridPicture } from '@/media/previews';

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
  const { counts, newCount, showNew, rebase, refresh } = useNewContent(collection.id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  // Whether this page pushed `?frame=`: then closing goes Back, so Back never reopens it.
  const openedHere = useRef(false);
  const { toast } = useToast();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // The frame toggled last: the start of a Shift+click range.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  // Another type or order shows other frames: the selection does not carry over.
  const view = `${kind ?? 'all'}:${sort}`;
  const [selectionView, setSelectionView] = useState(view);
  if (selectionView !== view) {
    setSelectionView(view);
    setSelected(new Set());
    setAnchor(null);
  }
  const grid = useRef<HTMLDivElement>(null);
  const selectButton = useRef<HTMLButtonElement>(null);

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
  usePendingPreviews(collection.id, items);
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

  /** «Оновити»: no push yet, so the admin asks for what arrived (the 15 s line stays too). */
  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshed(false);
    try {
      await Promise.all([refresh(), links.refetch()]);
      setRefreshed(true);
    } finally {
      setRefreshing(false);
    }
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

  /** Out of every loaded list at once; the rest of the grid stays where it is. */
  async function dropFrames(ids: ReadonlySet<string>) {
    queryClient.setQueriesData<InfiniteData<AdminContentPage>>(
      { queryKey: contentListsKey(collection.id) },
      (data) =>
        data === undefined
          ? data
          : {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((other) => !ids.has(other.id)),
              })),
            },
    );
    rebase();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contentCountsKey(collection.id) }),
      queryClient.invalidateQueries({ queryKey: collectionsListKey(collection.status) }),
    ]);
  }

  async function removeFrame(item: AdminContentItem) {
    await deleteContent(item.id);
    closeViewer();
    await dropFrames(new Set([item.id]));
  }

  function exitSelection() {
    setSelecting(false);
    setSelected(new Set());
    setAnchor(null);
  }

  /** A click (Shift: the range from the last toggled frame) or `x` on a frame. */
  function toggleFrame(id: string, range: boolean) {
    if (range && anchor !== null) {
      const span = rangeSelect(
        items.map((item) => item.id),
        anchor,
        id,
      );
      setSelected((current) => new Set([...current, ...span]));
    } else {
      setSelected((current) => toggle(current, id));
    }
    setAnchor(id);
  }

  // `x` on a focused frame selects it, entering selection mode (§5.13).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'x' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const frame = target?.closest<HTMLElement>('[data-item]');
      if (frame?.dataset.item === undefined || !grid.current?.contains(frame)) return;
      event.preventDefault();
      setSelecting(true);
      toggleFrame(frame.dataset.item, event.shiftKey);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  /** One request per 100 frames; frames already gone count as deleted (idempotent). */
  /**
   * One request per 100 frames; frames already gone count as deleted (idempotent), and so do
   * ids the API no longer finds (deleted elsewhere or purged): none of them stay on screen.
   * Focus then moves to the frame after the first deleted one (or «Вибрати»), never to the page.
   */
  async function removeSelected() {
    const gone = new Set<string>();
    const order = items.map((item) => item.id);
    try {
      for (const ids of chunks([...selected])) {
        const result = await bulkDeleteContent(collection.id, ids);
        for (const id of [...result.deleted, ...result.alreadyDeleted, ...result.notFound]) {
          gone.add(id);
        }
      }
    } finally {
      if (gone.size > 0) {
        setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
        void dropFrames(gone);
      }
    }
    const first = order.findIndex((id) => gone.has(id));
    const next =
      order.slice(first).find((id) => !gone.has(id)) ?? order.find((id) => !gone.has(id));
    exitSelection();
    toast({ variant: 'info', title: t('select.done', { count: gone.size }) });
    // After the dialog has closed and returned focus to its (now removed) trigger.
    setTimeout(() => {
      const target =
        next === undefined
          ? null
          : grid.current?.querySelector<HTMLElement>(`[data-item="${next}"] button`);
      (target ?? selectButton.current)?.focus();
    }, 0);
  }

  const longPress = useLongPress((id) => {
    setSelecting(true);
    toggleFrame(id, false);
  });

  if (counts.data?.total === 0 && items.length === 0) {
    return <EmptyCollection collection={collection} />;
  }

  const filter = filterOf(kind);
  const countOf = (value: KindFilter) =>
    counts.data === undefined ? undefined : counts.data[value === 'all' ? 'total' : value];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* One toolbar row once it fits (an 832px column: not beside the sidebar at 1024): chips
          left, the order and «Оновити» right, all 36px (44px on touch) on one centre line. */}
      <div className="@container/toolbar min-w-0">
        <div className="flex min-w-0 flex-col gap-3 @min-[52rem]/toolbar:flex-row @min-[52rem]/toolbar:items-center @min-[52rem]/toolbar:justify-between">
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
            <span id={sortId} className="shrink-0 text-sm text-muted-foreground max-sm:sr-only">
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
                className="h-11 w-full min-w-0 sm:min-w-44 md:h-9 md:w-52 pointer-coarse:h-11"
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
            {/* «Вибрати», then «Вибрати все завантажене» while selecting; icon only on phones. */}
            {selecting ? (
              <Button
                variant="outline"
                onClick={() => setSelected(new Set(items.map((item) => item.id)))}
                className="h-11 shrink-0 px-3 md:h-9 pointer-coarse:h-11"
              >
                <ListChecks aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">{t('select.all')}</span>
              </Button>
            ) : (
              <Button
                ref={selectButton}
                variant="outline"
                disabled={items.length === 0}
                onClick={() => setSelecting(true)}
                className="h-11 shrink-0 px-3 md:h-9 pointer-coarse:h-11"
              >
                <CheckSquare aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">{t('select.start')}</span>
              </Button>
            )}
            {/* Icon only on phones (the word stays as its name), icon and word from sm. */}
            <Button
              variant="outline"
              aria-disabled={refreshing || undefined}
              onClick={() => void refreshAll()}
              className="h-11 shrink-0 px-3 md:h-9 pointer-coarse:h-11"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(
                  'size-4',
                  refreshing && 'motion-safe:animate-spin motion-safe:[animation-duration:900ms]',
                )}
              />
              <span className="max-sm:sr-only">{t('refresh')}</span>
            </Button>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {refreshed ? t('refreshed') : null}
      </p>

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
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-control" />
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
        <div ref={grid} className="grid gap-4">
          <FrameGrid ariaLabel={t('listLabel')}>
            {items.map((item) => (
              <div
                key={item.id}
                data-frame={item.frameNo}
                data-item={item.id}
                // A long-press selects; the phone's own callout and text selection stay away.
                className="select-none [-webkit-touch-callout:none]"
                {...longPress.handlers(item.id)}
              >
                <AdminFrame
                  item={item}
                  collectionId={collection.id}
                  onOpen={() => {
                    if (!longPress.consume(item.id)) openFrame(item.frameNo);
                  }}
                  {...(selecting
                    ? {
                        selection: {
                          selected: selected.has(item.id),
                          onToggle: (event: MouseEvent<HTMLButtonElement>) => {
                            if (!longPress.consume(item.id)) toggleFrame(item.id, event.shiftKey);
                          },
                        },
                      }
                    : {})}
                />
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
          {selecting ? (
            <SelectionBar
              count={selected.size}
              countLabel={t('select.count', { count: selected.size })}
              label={t('select.barLabel')}
              clearLabel={t('select.clear')}
              onClear={exitSelection}
              className="max-lg:-mx-(--stepler-gutter)"
              actions={
                <Button
                  variant="outline"
                  aria-disabled={selected.size === 0 || undefined}
                  onClick={() => {
                    if (selected.size > 0) setConfirmingBulk(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {t('select.delete')}
                </Button>
              }
            />
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirmingBulk}
        onOpenChange={setConfirmingBulk}
        title={t('select.confirmTitle', { count: selected.size })}
        description={t('select.confirmText')}
        confirmLabel={t('select.confirm')}
        cancelLabel={t('delete.cancel')}
        pendingLabel={t('delete.pending')}
        errorMessage={t('select.failed')}
        destructive
        onConfirm={removeSelected}
      />

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

function AdminFrame({
  item,
  collectionId,
  onOpen,
  selection,
}: {
  item: AdminContentItem;
  collectionId: string;
  onOpen: () => void;
  /** In selection mode: the frame toggles instead of opening. */
  selection?: { selected: boolean; onToggle: (event: MouseEvent<HTMLButtonElement>) => void };
}) {
  const t = useTranslations('content');
  const format = useFormatter();
  const time = format.dateTime(new Date(item.createdAt), { hour: '2-digit', minute: '2-digit' });
  const name = item.contributorName ?? t('noName');
  const baseName = t('frameName', {
    number: item.frameNo,
    kind: t(`kind.${item.kind}`),
    time,
    name,
  });
  const accessibleName = selection?.selected
    ? t('select.selectedName', { name: baseName })
    : baseName;
  const select =
    selection === undefined
      ? {}
      : { selectable: true, selected: selection.selected, onToggleSelect: selection.onToggle };
  if (item.kind === 'TEXT') {
    return (
      <Frame
        kind="text"
        number={item.frameNo}
        text={item.text ?? ''}
        name={name}
        accessibleName={accessibleName}
        onOpen={onOpen}
        {...select}
      />
    );
  }
  if (item.kind === 'DOCUMENT') {
    return (
      <Frame
        kind="document"
        number={item.frameNo}
        {...(item.sizeBytes === null ? {} : { meta: formatBytes(format.number, item.sizeBytes) })}
        docType={documentType(item)}
        {...(item.originalFilename === null ? {} : { docTitle: item.originalFilename })}
        accessibleName={accessibleName}
        onOpen={onOpen}
        {...select}
      />
    );
  }
  // The 480px thumbnail, for videos too (the 1600px poster is for the viewer); never the
  // original in the grid: it can be 50 MB, or 2 GB for a video.
  const picture = gridPicture(item);
  const duration = item.durationMs === null ? {} : { meta: formatDuration(item.durationMs) };
  if (picture.kind === 'thumbnail' || (picture.kind === 'failed' && item.kind === 'VIDEO')) {
    return (
      <Frame
        kind={item.kind === 'VIDEO' ? 'video' : 'photo'}
        // A video without a poster is ▶ on grey (D4).
        {...(picture.kind === 'thumbnail'
          ? { media: <Thumbnail url={picture.url} item={item} collectionId={collectionId} /> }
          : {})}
        number={item.frameNo}
        {...duration}
        accessibleName={accessibleName}
        onOpen={onOpen}
        {...select}
      />
    );
  }
  return (
    <Frame
      kind="pending-preview"
      number={item.frameNo}
      {...duration}
      placeholderLabel={t(picture.kind === 'failed' ? 'previewUnavailable' : 'pendingPreview')}
      accessibleName={accessibleName}
      onOpen={onOpen}
      {...select}
    />
  );
}

/**
 * A grid thumbnail: lazy, decoded off the main thread, sized by the original's ratio. A link that
 * expired while the grid stayed open is replaced by asking for this frame again.
 */
function Thumbnail({
  url,
  item,
  collectionId,
}: {
  url: string;
  item: AdminContentItem;
  collectionId: string;
}) {
  const queryClient = useQueryClient();
  return (
    <MediaImg
      onExpired={() => void refreshFrames(queryClient, collectionId, [item.id])}
      alt={DECORATIVE}
      src={url}
      loading="lazy"
      decoding="async"
      {...(item.width === null || item.height === null
        ? {}
        : { width: item.width, height: item.height })}
    />
  );
}

/** Decorative: the frame's accessible name says what the picture is. */
const DECORATIVE = '';

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

/** Held this long without moving, a touch selects the frame (§5.13). */
const LONG_PRESS_MS = 500;
/** A finger that moves farther is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * A touch long-press on a frame: `onLongPress` fires after 500ms unless the finger moved or
 * lifted. The click that follows the lift is then swallowed (`consume`), so the press does not
 * also open or toggle the frame. Mouse and pen are left alone.
 */
function useLongPress(onLongPress: (id: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef<string | null>(null);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);

  return {
    handlers: (id: string) => ({
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'touch') return;
        cancel();
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = id;
          onLongPress(id);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const from = start.current;
        if (from === null) return;
        if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > LONG_PRESS_SLOP_PX) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      // A long touch also asks for the context menu (Android); the press means "select".
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
        if (timer.current !== null || fired.current === id) event.preventDefault();
      },
    }),
    /** True once for the click that ends a long-press on `id`. */
    consume: (id: string): boolean => {
      if (fired.current !== id) return false;
      fired.current = null;
      return true;
    },
  };
}
