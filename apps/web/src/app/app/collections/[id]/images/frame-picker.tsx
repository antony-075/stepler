'use client';

// «Вибрати з кадрів»: one guest photo for the draft's cover or background, or the collection image
// (plan Tasks 11, 14, 24, [A8]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - A short task over the tab: a bottom sheet on phones (in the thumb zone, the safe area kept),
//   a centred dialog of at most 46rem from 640px (the same `Sheet side="bottom"`, so there is one
//   component and no width check in script).
// - The photos only, newest first, as the same borderless tiles as «Вміст» (`FrameGrid`, the
//   480px thumbnails, the number pill): the admin recognises the frame they mean. 48 at a time
//   with «Показати ще».
// - Single choice: tapping a tile selects it (the pencil ring and ✓, `aria-pressed`; tapping
//   another moves the choice). Only a `READY` photo can be chosen (remark 75): one still being
//   prepared shows «Готується прев’ю» (asked for again every 10 s like in «Вміст», and becomes
//   selectable in place); one the worker failed on shows «Не можна використати».
// - The line under the title says what the copy means where it goes (`description`).
// - The footer never scrolls: «Вибрати» (ink, 44px, waits for a choice) and
//   «Скасувати». Empty: «Гості ще не додали фото»; a failed load: an alert with «Спробувати ще».
// - Closing returns focus to the button that opened it (Radix).

import type { AdminContentItem, AdminContentPage } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Frame } from '@stepler/ui/components/frame';
import { FrameGrid } from '@stepler/ui/components/frame-grid';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { contentListKey, listContent } from '@/api/content';
import { MediaImg } from '@/media/media-img';
import { gridPicture } from '@/media/previews';
import { usePendingPreviews } from '../content/use-pending-previews';

export function FramePicker({
  collectionId,
  open,
  onOpenChange,
  onPicked,
  description,
}: {
  collectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Uses the frame; the picker closes once it resolves, stays open if it throws. */
  onPicked: (item: AdminContentItem) => Promise<void>;
  /** What the copy means where it goes; the guest page's line by default. */
  description?: string;
}) {
  const t = useTranslations('guestPage.picker');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-[46rem]">
        <SheetHeader closeLabel={t('close')}>
          <div className="grid gap-0.5">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{description ?? t('description')}</SheetDescription>
          </div>
        </SheetHeader>
        {/* Mounted only while open, so the list loads when the picker opens. */}
        {open ? (
          <PickerBody
            collectionId={collectionId}
            onCancel={() => onOpenChange(false)}
            onPicked={async (item) => {
              await onPicked(item);
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PickerBody({
  collectionId,
  onCancel,
  onPicked,
}: {
  collectionId: string;
  onCancel: () => void;
  onPicked: (item: AdminContentItem) => Promise<void>;
}) {
  const t = useTranslations('guestPage.picker');
  const [selected, setSelected] = useState<AdminContentItem | null>(null);
  const [pending, setPending] = useState(false);
  const list = useInfiniteQuery({
    queryKey: contentListKey(collectionId, 'PHOTO', 'newest'),
    queryFn: ({ pageParam }) =>
      listContent(collectionId, {
        kind: 'PHOTO',
        sort: 'newest',
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AdminContentPage) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  // A photo that just arrived becomes selectable once the worker made its thumbnail.
  usePendingPreviews(collectionId, items);

  async function confirm() {
    if (selected === null || pending) return;
    setPending(true);
    try {
      await onPicked(selected);
    } catch {
      // The caller said why (a toast); the choice stays for another try.
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SheetBody className="px-4 py-4 sm:px-6">
        {list.isPending ? (
          <div role="status" aria-busy="true" aria-label={t('loading')}>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
              {Array.from({ length: 8 }, (_, i) => (
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
        ) : items.length === 0 ? (
          <EmptyState headingLevel={3} title={t('empty')} description={t('emptyText')} />
        ) : (
          <div className="grid gap-4">
            <FrameGrid ariaLabel={t('listLabel')}>
              {items.map((item) => (
                <PickerFrame
                  key={item.id}
                  item={item}
                  collectionId={collectionId}
                  selected={selected?.id === item.id}
                  onSelect={() => setSelected(selected?.id === item.id ? null : item)}
                />
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
      </SheetBody>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          data-slot="frame-picker-confirm"
          aria-disabled={selected === null || pending || undefined}
          onClick={() => void confirm()}
        >
          {pending ? t('pending') : t('confirm')}
        </Button>
      </div>
    </>
  );
}

function PickerFrame({
  item,
  collectionId,
  selected,
  onSelect,
}: {
  item: AdminContentItem;
  collectionId: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('guestPage.picker');
  const queryClient = useQueryClient();
  const picture = gridPicture(item);
  // Only a photo the worker finished (its location metadata removed, its previews made) can be
  // used: `READY` (owner remark 75). One it gave up on may still have a thumbnail, but the API
  // refuses it (`COVER_SOURCE_INVALID`): it is shown, dimmed, with the reason, never selectable.
  if (picture.kind !== 'thumbnail' || item.processingStatus !== 'READY') {
    const failed = item.processingStatus === 'FAILED';
    return (
      <Frame
        kind="pending-preview"
        number={item.frameNo}
        placeholderLabel={t(failed ? 'unusable' : 'notReady')}
        accessibleName={t(failed ? 'frameUnusable' : 'frameNotReady', { number: item.frameNo })}
      />
    );
  }
  return (
    <Frame
      kind="photo"
      number={item.frameNo}
      selectable
      selected={selected}
      onToggleSelect={onSelect}
      accessibleName={t('frameName', { number: item.frameNo })}
      media={
        <MediaImg
          src={picture.url}
          alt={DECORATIVE}
          loading="lazy"
          decoding="async"
          onExpired={() =>
            void queryClient.invalidateQueries({
              queryKey: contentListKey(collectionId, 'PHOTO', 'newest'),
            })
          }
        />
      }
    />
  );
}

/** Decorative: the frame's accessible name says which photo it is. */
const DECORATIVE = '';
