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
import { listGuestContent } from './api';

export const guestContentKey = (collectionId: string, scope: 'own' | 'all') =>
  ['guest-content', collectionId, scope] as const;

/** A frame's time of day, 24-hour (DESIGN-SYSTEM.md §3.4). */
export function useFrameTime(): (iso: string) => string {
  const format = useFormatter();
  return (iso) => format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });
}

/** Decorative: the frame's accessible name says what the picture is. */
const DECORATIVE = '';

function GuestFrame({ item }: { item: GuestContentItem }) {
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
  // Photos and videos show their thumbnail (or poster) once the worker made one (PR D); never
  // the original: it can be 50 MB. Until then, the placeholder.
  const thumb = item.kind === 'VIDEO' ? (item.posterUrl ?? item.thumbnailUrl) : item.thumbnailUrl;
  if (thumb !== null) {
    return (
      <Frame
        kind={item.kind === 'VIDEO' ? 'video' : 'photo'}
        // A presigned storage URL: nothing for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        media={<img alt={DECORATIVE} src={thumb} loading="lazy" />}
        number={number}
        time={time}
        accessibleName={
          number === undefined ? t('fileOther', { time }) : t('fileOwn', { number, time })
        }
      />
    );
  }
  return (
    <Frame
      kind="pending-preview"
      number={number}
      time={time}
      placeholderLabel={t('pendingPreview')}
      accessibleName={
        number === undefined ? t('fileOther', { time }) : t('fileOwn', { number, time })
      }
    />
  );
}

/**
 * The guest's frames (`own`: this browser's session) or everyone's (`all`, only with the shared
 * gallery), newest first [C5], 48 per page with «Показати ще» (a button, not scroll-triggered).
 * Numbers appear only on the guest's own frames; names never (the API omits them, [C16]).
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
    refetchOnWindowFocus: false,
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
  if (query.isError) {
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
          <GuestFrame key={item.id} item={item} />
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
