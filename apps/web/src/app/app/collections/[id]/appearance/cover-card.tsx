'use client';

import type { Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { Progress } from '@stepler/ui/components/progress';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ImagePlus, Images, RotateCw, Trash2, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, removeCover, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import { CollectionCoverImage } from '../../../collection-cover-image';
import { coverState } from './cover-state';
import { useCoverUpload } from './use-cover-upload';

/** What the file picker offers: the photo types the API takes as a cover (HEIC/HEIF too). */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.heic,.heif';

/**
 * «Обкладинка» on the «Вигляд» tab (plan Task 10): the cover as guests will see it (16:10, the
 * phone's hero) and what can be done with it now. Every state keeps the picture's box in place:
 * none (the initials), uploading (dimmed, the progress line, «Скасувати»), a failed transfer
 * (why, «Повторити»), processing («Готується обкладинка…», the tab polls), failed (why, replace
 * or remove), ready (the picture, «Замінити» and «Видалити обкладинку»). `onPickFrame` opens
 * the frame picker; `readOnly` (archived) shows the cover without actions.
 */
export function CoverCard({
  collection,
  readOnly,
  onPickFrame,
}: {
  collection: Collection;
  readOnly: boolean;
  onPickFrame?: () => void;
}) {
  const t = useTranslations('appearance.cover');
  const tRoot = useTranslations();
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const fileInput = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [confirming, setConfirming] = useState(false);
  const upload = useCoverUpload(collection.id, () =>
    toast({ variant: 'success', title: t('uploaded') }),
  );
  const state = coverState(collection.cover, upload.phase);
  const remove = useMutation({
    mutationFn: () => removeCover(collection.id),
    onSuccess: async () => {
      queryClient.setQueryData<CollectionDetail>(collectionKey(collection.id), (previous) =>
        previous === undefined ? undefined : { ...previous, cover: null },
      );
      toast({ variant: 'info', title: t('removed') });
      await invalidate();
    },
  });
  const removeFailure = isApiError(remove.error) ? remove.error.code : 'INTERNAL';

  const pickFile = () => fileInput.current?.click();

  /** «Завантажити зображення» and, when the picker is wired, «Вибрати з кадрів». */
  const sources = (
    <>
      <Button className="w-full sm:w-auto" onClick={pickFile}>
        <Upload aria-hidden="true" />
        {t('upload')}
      </Button>
      {onPickFrame === undefined ? null : (
        <Button variant="outline" className="w-full sm:w-auto" onClick={onPickFrame}>
          <Images aria-hidden="true" />
          {t('pickFrame')}
        </Button>
      )}
    </>
  );

  /** «Замінити»: a menu of the two sources, or just the upload without the picker. */
  const replace =
    onPickFrame === undefined ? (
      <Button variant="outline" className="w-full sm:w-auto" onClick={pickFile}>
        <ImagePlus aria-hidden="true" />
        {t('replace')}
      </Button>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full sm:w-auto">
            <ImagePlus aria-hidden="true" />
            {t('replace')}
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={pickFile}>
            <Upload aria-hidden="true" />
            {t('upload')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onPickFrame}>
            <Images aria-hidden="true" />
            {t('pickFrame')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const removeButton = (
    <Button
      variant="ghost"
      className="w-full text-destructive hover:text-destructive sm:w-auto"
      onClick={() => {
        remove.reset();
        setConfirming(true);
      }}
    >
      <Trash2 aria-hidden="true" />
      {t('remove')}
    </Button>
  );

  const uploadFailure =
    upload.phase.kind === 'failed'
      ? upload.phase.code === 'NETWORK' || upload.phase.code === 'STORAGE_403'
        ? t(`reason.${upload.phase.code}`)
        : tRoot(errorMessageKey(upload.phase.code))
      : null;

  return (
    <div
      data-slot="cover-card"
      data-state={state}
      className="grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-start md:gap-8"
    >
      <div className="relative">
        <CollectionCoverImage
          collection={collection}
          size="hero"
          className={cn(
            'transition-opacity duration-(--duration-fast) motion-reduce:transition-none',
            state === 'uploading' && 'opacity-50',
          )}
        />
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <p id={statusId} className="max-w-[60ch] text-sm text-pretty text-muted-foreground">
          {state === 'ready' ? t('readyHint') : t('hint')}
        </p>

        {state === 'uploading' && upload.phase.kind === 'uploading' ? (
          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-semibold">{t('uploading')}</span>
              <span className="type-data tabular-nums">
                {format.number(upload.phase.progress / 100, { style: 'percent' })}
              </span>
            </div>
            <Progress value={upload.phase.progress} label={t('uploading')} />
            <Button
              variant="outline"
              className="w-full sm:w-auto sm:justify-self-start"
              onClick={upload.cancel}
            >
              {t('cancel')}
            </Button>
          </div>
        ) : null}

        {state === 'failed-upload' ? (
          <Alert
            variant="error"
            title={t('uploadFailed')}
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                {upload.phase.kind === 'failed' && upload.phase.retryable ? (
                  <Button variant="outline" onClick={upload.retry}>
                    <RotateCw aria-hidden="true" />
                    {t('retry')}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={pickFile}>
                  {t('chooseAnother')}
                </Button>
                <Button variant="ghost" onClick={upload.cancel}>
                  {t('dismiss')}
                </Button>
              </div>
            }
          >
            {uploadFailure}
          </Alert>
        ) : null}

        {state === 'processing' ? (
          <p className="flex items-center gap-2.5 font-semibold" data-slot="cover-processing">
            <Spinner label={t('processing')} className="size-4 text-muted-foreground" />
            <span aria-hidden="true">{t('processing')}</span>
          </p>
        ) : null}

        {state === 'failed' ? (
          <Alert variant="error" title={t('failedTitle')}>
            {t('failedText')}
          </Alert>
        ) : null}

        {readOnly ? null : state === 'none' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{sources}</div>
        ) : state === 'ready' || state === 'failed' || state === 'processing' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {replace}
            {removeButton}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-slot="cover-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so picking the same file again fires `change` again.
          event.target.value = '';
          if (file !== undefined) upload.start(file);
        }}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t('removeConfirmTitle')}
        description={t('removeConfirmText')}
        confirmLabel={t('removeConfirm')}
        cancelLabel={t('cancel')}
        pendingLabel={t('removePending')}
        errorMessage={tRoot(errorMessageKey(removeFailure))}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
    </div>
  );
}
