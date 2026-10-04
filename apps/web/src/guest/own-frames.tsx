'use client';

import type { GuestContentItem, GuestContentPage } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MediaImg } from '@/media/media-img';
import {
  awaitsPreview,
  GUEST_PREVIEW_WAIT_MS,
  gridPicture,
  guestPollDelay,
} from '@/media/previews';
import { listGuestContent } from './api';

export const guestContentKey = (collectionId: string, scope: 'own' | 'all') =>
  ['guest-content', collectionId, scope] as const;

/** A frame's time of day, 24-hour (DESIGN-SYSTEM.md §3.4). */
export function useFrameTime(): (iso: string) => string {
  const format = useFormatter();
  return (iso) => format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
}

/** Presigned links last at least an hour; a list this old is fetched again on focus. */
const LIST_STALE_MS = 30 * 60_000;

/** Decorative: the frame's accessible name says what the picture is. */
const DECORATIVE = '';

function GuestFrame({ item, onExpired }: { item: GuestContentItem; onExpired: () => void }) {
  const t = useTranslations('guest.frame');
  const time = useFrameTime()(item.createdAt);
  const number = item.frameNo ?? undefined;
  if (item.kind === 'TEXT') {
    return (
      <Frame
        kind="text"
        number={number}
        time={time}
        text={item.text ?? ''}
        accessibleName={
          number === undefined ? t('textOther', { time }) : t('textOwn', { number, time })
        }
      />
    );
  }
  if (item.kind === 'DOCUMENT') {
    // Only the guest's own frames carry a file name; others show the type alone.
    const name = item.originalFilename;
    const type = name?.includes('.') ? (name.split('.').pop()?.toUpperCase() ?? '') : '';
    return (
      <Frame
        kind="document"
        number={number}
        time={time}
        docType={type === '' ? t('documentType') : type}
        {...(name === null ? {} : { docTitle: name })}
        accessibleName={
          number === undefined
            ? t('documentOther', { time })
            : t('documentOwn', { number, time, type })
        }
      />
    );
  }
  // Photos and videos show their 480px thumbnail (videos with ▶), never the original: it can be
  // 50 MB. Until the worker made it, the placeholder; if it cannot, the type tile.
  const picture = gridPicture(item);
  const kind = t(`kind.${item.kind}`);
  const named = (own: string, other: string) =>
    number === undefined ? t(other, { kind, time }) : t(own, { number, kind, time });
  if (picture.kind === 'thumbnail' || (picture.kind === 'failed' && item.kind === 'VIDEO')) {
    return (
      <Frame
        kind={item.kind === 'VIDEO' ? 'video' : 'photo'}
        {...(picture.kind === 'thumbnail'
          ? {
              media: (
                <MediaImg
                  onExpired={onExpired}
                  alt={DECORATIVE}
                  src={picture.url}
                  loading="lazy"
                  decoding="async"
                  {...(item.width === null || item.height === null
                    ? {}
                    : { width: item.width, height: item.height })}
                />
              ),
            }
          : {})}
        number={number}
        time={time}
        accessibleName={
          picture.kind === 'failed'
            ? named('failedOwn', 'failedOther')
            : named('mediaOwn', 'mediaOther')
        }
      />
    );
  }
  return (
    <Frame
      kind="pending-preview"
      number={number}
      time={time}
      placeholderLabel={t(picture.kind === 'failed' ? 'previewUnavailable' : 'pendingPreview')}
      accessibleName={
        picture.kind === 'failed'
          ? named('failedOwn', 'failedOther')
          : number === undefined
            ? t('fileOther', { time })
            : t('fileOwn', { number, time })
      }
    />
  );
}

/**
 * The guest's frames (`own`: this browser's session) or everyone's (`all`, only with the shared
 * gallery), newest first [C5], 48 per page with «Показати ще» (a button, not scroll-triggered).
 * Numbers appear only on the guest's own frames; names never (the API omits them, [C16]).
 * Frames waiting for their preview are refreshed every 10 s until it arrives.
 * `empty` renders when there is nothing; `null` hides the whole list then.
 */
export function GuestFrames({
  collectionId,
  scope,
  call,
  label,
  empty,
  hide,
}: {
  collectionId: string;
  scope: 'own' | 'all';
  call: <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;
  label: string;
  empty: ReactNode;
  /** Items already shown elsewhere (this page's upload batch). */
  hide?: ReadonlySet<string>;
}) {
  const t = useTranslations('guest');
  const query = useInfiniteQuery({
    queryKey: guestContentKey(collectionId, scope),
    queryFn: ({ pageParam }) =>
      call((id) =>
        listGuestContent(id, { scope, ...(pageParam === null ? {} : { cursor: pageParam }) }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: GuestContentPage) => last.nextCursor,
    retry: false,
    // Presigned links last at least an hour: a list older than 30 minutes is fetched again when
    // the guest comes back to the tab (phones sleep for hours at an event).
    staleTime: LIST_STALE_MS,
    refetchOnWindowFocus: true,
    // Only the guest's own frames wait for previews they care about, and that list only grows
    // with their own uploads, so nothing moves unexpectedly. Asked again every 15–20 s (jitter:
    // a venue's guests share one IP and its read limit), for at most 10 minutes per frame; the
    // shared gallery is never polled.
    refetchInterval: (q) =>
      scope === 'own' &&
      q.state.data?.pages.some((page) =>
        page.items.some((item) => awaitsPreview(item, Date.now(), GUEST_PREVIEW_WAIT_MS)),
      )
        ? guestPollDelay()
        : false,
    refetchIntervalInBackground: false,
  });

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="grid grid-cols-3 gap-px">
        <span className="sr-only">{t('loadingFrames')}</span>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  }
  // Only when nothing could be loaded: a failed background refresh keeps the frames on screen.
  if (query.data === undefined) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        }
      >
        {t('listError')}
      </Alert>
    );
  }

  const items = query.data.pages
    .flatMap((page) => page.items)
    .filter((item) => hide === undefined || !hide.has(item.id));
  if (items.length === 0) return hide !== undefined && hide.size > 0 ? null : empty;
  return (
    <div className="grid gap-3">
      <FrameGrid ariaLabel={label}>
        {items.map((item) => (
          <GuestFrame key={item.id} item={item} onExpired={() => void query.refetch()} />
        ))}
      </FrameGrid>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-center"
          aria-disabled={query.isFetchingNextPage || undefined}
          onClick={() => {
            if (!query.isFetchingNextPage) void query.fetchNextPage();
          }}
        >
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
