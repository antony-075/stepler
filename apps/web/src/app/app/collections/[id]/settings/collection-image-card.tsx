'use client';

// «Картинка колекції» in «Параметри колекції» (plan Task 24, ADR 0017; owner 2026-10-05).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - A SectionCard like «Архівування»: the h2, then the helper as its first line, because the one
//   thing to understand is who sees it (only the owner, on the dashboard; guests see the cover).
// - The picture is the real mark at the dashboard card's size (80px on phones, 128px from `sm`),
//   initials included, so the admin sees exactly what the card will show. Beside it: the status
//   line (`role="status"`), then «Завантажити» (ink), «Вибрати з кадрів» (outline) and
//   «Прибрати» (outline: the danger zone keeps the page's only red button) behind a destructive
//   ConfirmDialog, then the file types.
// - States: none (initials), uploading (progress line and «Скасувати»), a failed transfer (why,
//   «Повторити»), processing («Готується…», asked for again every 10 s), failed, ready; archived
//   is read-only with one line saying why. Phones: the buttons at full width, one under another
//   (as «Архівувати»); from `sm` in a row. All ≥ 44px; nothing is hover-only.

import type { AdminContentItem, Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Progress } from '@stepler/ui/components/progress';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Images, RotateCw, Trash2, Upload } from 'lucide-react';
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
import { CollectionMark } from '../../../collection-mark';
import { FramePicker } from '../images/frame-picker';
import { imageErrorKey } from '../images/image-errors';
import { imageState } from '../images/image-state';
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
  const readOnly = collection.status === 'ARCHIVED';
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
  const hintId = 'collection-image-hint';

  return (
    <SectionCard id="collection-image" title={t('image')}>
      <div
        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:gap-6"
        data-slot="collection-image"
        data-state={state}
      >
        <CollectionMark
          collection={collection}
          size="cover"
          className={state === 'uploading' ? 'opacity-50' : undefined}
        />
        <div className="grid min-w-0 gap-3">
          <p id={hintId} className="max-w-[60ch] text-sm text-pretty text-muted-foreground">
            {t('imageHint')}
          </p>
          <p className="text-sm" role="status">
            {state === 'uploading' && upload.phase.kind === 'uploading' ? (
              <span className="font-semibold">
                {tImage('uploading')}{' '}
                <span className="type-data tabular-nums">
                  {format.number(upload.phase.progress / 100, { style: 'percent' })}
                </span>
              </span>
            ) : state === 'processing' ? (
              <span className="inline-flex items-center gap-2 font-semibold">
                <Spinner label={tImage('processing')} className="size-4 text-muted-foreground" />
                <span aria-hidden="true">{tImage('processing')}</span>
              </span>
            ) : state === 'failed' ? (
              <span className="text-destructive">{tImage('failed')}</span>
            ) : state === 'ready' ? (
              <span className="font-semibold">{t('imageReady')}</span>
            ) : state === 'none' ? (
              <span className="text-muted-foreground">{t('imageNone')}</span>
            ) : null}
          </p>
        </div>
      </div>

      {state === 'uploading' && upload.phase.kind === 'uploading' ? (
        <div className="grid gap-2">
          <Progress value={upload.phase.progress} label={tImage('uploading')} />
          <Button variant="outline" className="justify-self-start" onClick={upload.cancel}>
            {tImage('cancel')}
          </Button>
        </div>
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
        <p className="text-sm text-muted-foreground">{tImage('archivedRefused')}</p>
      ) : state === 'uploading' ? null : (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button
              className="w-full sm:w-auto"
              aria-describedby={hintId}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              {tImage('upload')}
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPicking(true)}>
              <Images aria-hidden="true" />
              {tImage('pickFrame')}
            </Button>
            {image === null ? null : (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  setRemoveFailure(null);
                  setConfirming(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t('imageRemove')}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{tImage('helper')}</p>
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
