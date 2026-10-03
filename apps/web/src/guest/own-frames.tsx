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
  // Files arrive with uploads; until previews exist they show the placeholder.
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
}: {
  collectionId: string;
  scope: 'own' | 'all';
  call: <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;
  label: string;
  empty: ReactNode;
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

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return empty;
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
