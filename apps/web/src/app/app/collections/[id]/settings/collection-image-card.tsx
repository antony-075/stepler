'use client';

// «Картинка колекції» in «Параметри колекції» (plan Task 24, ADR 0017; owner 2026-10-05).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design; V1
// «Графіт», DESIGN-SYSTEM.md §0): the same idiom as the guest page editor's image control.
// - A SectionCard after «Назва й опис»: the h2 with the hint on the right from `md`, because the
//   one thing to understand is who sees it (only the owner, on the dashboard; guests see the cover).
// - The tile is the real mark as the dashboard's tiles and the collection's mini-nav show it (the
//   16:9 band; initials included), so the admin sees exactly what those will show. Beside it what
//   is happening in words (`role="status"`), with «Прибрати» once there is an image (a quiet
//   destructive text button behind a destructive ConfirmDialog; the danger zone keeps the page's
//   only red fill). Under them «Завантажити»/«Замінити» (ink) and «Вибрати з кадрів» (outline),
//   then the file types.
// - States keep the tile's box in place: none (the initials, «Поки що — ініціали»); uploading (the
//   tile under a veil, the percent in mono, a progress line, «Скасувати»); a failed transfer (why,
//   «Повторити»); processing (a spinner on the tile, «Готується…», asked for again every 10 s;
//   after two minutes the slow state with «Перевірити ще раз»); failed (a warning on the tile);
//   ready. Archived is read-only with one line saying why. Buttons share the row and wrap; all
//   ≥ 44px on touch; nothing is hover-only.

import type { AdminContentItem, Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Progress } from '@stepler/ui/components/progress';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Images, LoaderCircle, RotateCw, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import {
  collectionImageApi,
  collectionKey,
  removeCollectionImage,
  setCollectionImageFromFrame,
  useInvalidateCollections,
} from '@/api/collections';
import { writeLock } from '../../../access-model';
import { CollectionMark } from '../../../collection-mark';
import { FramePicker } from '../images/frame-picker';
import { imageErrorKey } from '../images/image-errors';
import { imageState } from '../images/image-state';
import { ImageProcessing, StatusLine } from '../images/image-status';
import { useImageUpload } from '../images/use-image-upload';
import { SectionCard } from '../section-card';

/** What the file picker offers: the photo types the API takes for an admin image. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.heic,.heif';

export function CollectionImageCard({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.settingsPage');
  const tImage = useTranslations('guestPage.image');
  const tRoot = useTranslations();
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removeFailure, setRemoveFailure] = useState<string | null>(null);
  const archived = collection.status === 'ARCHIVED';
  // Archived, or read-only through billing (ADR 0018): the image stays, nothing changes.
  const readOnly = archived || writeLock(collection).locked;
  const { image } = collection;

  // Every change answers the collection (removal: nothing): the detail keeps its storage line,
  // and the dashboard's lists are asked again.
  const applied = useCallback(
    async (next: Collection | null) => {
      if (next !== null) {
        queryClient.setQueryData<CollectionDetail>(collectionKey(collection.id), (previous) =>
          previous === undefined ? undefined : { ...previous, ...next },
        );
      }
      await invalidate();
    },
    [collection.id, invalidate, queryClient],
  );

  const api = useMemo(() => collectionImageApi(collection.id), [collection.id]);
  const upload = useImageUpload(api, (next) => void applied(next));
  const state = imageState(image, upload.phase);

  async function fromFrame(item: AdminContentItem) {
    try {
      await applied(await setCollectionImageFromFrame(collection.id, item.id));
    } catch (error) {
      const code = isApiError(error) ? error.code : 'INTERNAL';
      toast({
        variant: 'error',
        title: tImage('setFailed'),
        description: tRoot(imageErrorKey(code, 'frame')),
      });
      if (code === 'COLLECTION_ARCHIVED') await invalidate();
      throw error;
    }
  }

  const failure =
    upload.phase.kind === 'failed'
      ? upload.phase.code === 'NETWORK' || upload.phase.code === 'STORAGE_403'
        ? tImage(`reason.${upload.phase.code}`)
        : tRoot(imageErrorKey(upload.phase.code, 'upload'))
      : null;

  const canRemove = image !== null && !readOnly && state !== 'uploading';

  return (
    <SectionCard id="collection-image" title={t('image')} hint={t('imageHint')}>
      <div
        className="grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4"
        data-slot="collection-image"
        data-state={state}
      >
        <div aria-hidden="true" data-slot="image-tile" className="relative">
          <CollectionMark
            collection={collection}
            size="band"
            className={cn(
              'rounded-frame border text-[1.75rem]',
              state === 'failed' && 'border-destructive/40',
            )}
          />
          {state === 'uploading' ? (
            <span className="absolute inset-0 rounded-frame bg-(--veil)" />
          ) : state === 'processing' || state === 'failed' ? (
            <span
              className={cn('absolute inset-0 grid place-items-center rounded-frame bg-(--veil)', {
                'text-destructive': state === 'failed',
              })}
            >
              {state === 'failed' ? (
                <TriangleAlert className="size-5" />
              ) : (
                <LoaderCircle className="size-5 motion-safe:animate-spin" />
              )}
            </span>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-1 pt-0.5" role="status">
          {state === 'uploading' && upload.phase.kind === 'uploading' ? (
            <>
              <StatusLine strong>
                {tImage('uploading')}{' '}
                <span className="type-data tabular-nums">
                  {format.number(upload.phase.progress / 100, { style: 'percent' })}
                </span>
              </StatusLine>
              <Progress value={upload.phase.progress} label={tImage('uploading')} />
            </>
          ) : state === 'processing' ? (
            <ImageProcessing
              onCheck={() =>
                void queryClient.invalidateQueries({ queryKey: collectionKey(collection.id) })
              }
            />
          ) : state === 'failed' ? (
            <StatusLine tone="destructive" strong>
              {tImage('failed')}
            </StatusLine>
          ) : state === 'ready' ? (
            <StatusLine strong>{t('imageReady')}</StatusLine>
          ) : state === 'none' ? (
            <StatusLine tone="muted">{t('imageNone')}</StatusLine>
          ) : (
            // A failed transfer: the alert below says why; the image the collection has stays.
            <StatusLine strong>{image !== null ? t('imageReady') : t('imageNone')}</StatusLine>
          )}
          {canRemove ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 justify-self-start text-destructive hover:text-destructive pointer-coarse:min-h-11"
              onClick={() => {
                setRemoveFailure(null);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              {t('imageRemove')}
            </Button>
          ) : null}
        </div>
      </div>

      {state === 'uploading' ? (
        <Button variant="outline" className="justify-self-start" onClick={upload.cancel}>
          {tImage('cancel')}
        </Button>
      ) : null}

      {state === 'failed-upload' ? (
        <Alert
          variant="error"
          title={tImage('uploadFailed')}
          action={
            upload.phase.kind === 'failed' && upload.phase.retryable ? (
              <Button variant="outline" onClick={upload.retry}>
                <RotateCw aria-hidden="true" />
                {tImage('retry')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={upload.cancel}>
                {tImage('cancel')}
              </Button>
            )
          }
        >
          {failure}
        </Alert>
      ) : null}

      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          {archived ? tImage('archivedRefused') : tRoot('errors.COLLECTION_READ_ONLY')}
        </p>
      ) : state === 'uploading' ? null : (
        <div className="grid gap-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2 sm:flex sm:flex-wrap">
            <Button onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" />
              {image === null ? tImage('upload') : tImage('replace')}
            </Button>
            <Button variant="outline" onClick={() => setPicking(true)}>
              <Images aria-hidden="true" />
              {tImage('pickFrame')}
            </Button>
          </div>
          <p className="type-caption text-muted-foreground">{tImage('helper')}</p>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-slot="image-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so picking the same file again fires `change` again.
          event.target.value = '';
          if (file !== undefined) upload.start(file);
        }}
      />
      {readOnly ? null : (
        <FramePicker
          collectionId={collection.id}
          open={picking}
          onOpenChange={setPicking}
          onPicked={fromFrame}
          description={t('imagePickerDescription')}
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t('imageRemoveConfirmTitle')}
        description={t('imageRemoveConfirmText')}
        confirmLabel={t('imageRemoveConfirm')}
        cancelLabel={t('cancel')}
        pendingLabel={t('imageRemovePending')}
        onConfirm={async () => {
          try {
            await removeCollectionImage(collection.id);
            await applied(null);
          } catch (error) {
            const code = isApiError(error) ? error.code : 'INTERNAL';
            setRemoveFailure(tRoot(imageErrorKey(code, 'remove')));
            throw error;
          }
        }}
        errorMessage={removeFailure ?? tRoot(imageErrorKey('INTERNAL', 'remove'))}
      />
    </SectionCard>
  );
}
