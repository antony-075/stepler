'use client';

import type {
  AdminContentItem,
  AdminImage,
  GuestPageEditor,
  ImageSlotParam,
} from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Progress } from '@stepler/ui/components/progress';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { ImageOff, Images, RotateCw, Trash2, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { draftImageApi, removeDraftImage, setDraftImageFromFrame } from '@/api/collections';
import { FramePicker } from '../../images/frame-picker';
import { imageErrorKey } from '../../images/image-errors';
import { imageState } from '../../images/image-state';
import { useImageUpload } from '../../images/use-image-upload';

/** What the file picker offers: the photo types the API takes for an admin image. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.heic,.heif';

/**
 * One draft image (cover or background), as in E-editor: a small 16:10 picture with its status,
 * «Завантажити» (ink), «Вибрати з кадрів» (outline) and a red icon button to remove it, then the
 * file types. Every state keeps the picture's box in place: none (a quiet tile), uploading (the
 * progress line, «Скасувати»), a failed transfer (why, «Повторити»), processing («Готується…»;
 * the editor polls), failed, ready. Each change answers the whole editor state (`onEditor`); the
 * working copy is not touched, and the draft's revision does not move.
 */
export function ImageControl({
  collectionId,
  slot,
  image,
  readOnly,
  removeLabel,
  onEditor,
}: {
  collectionId: string;
  slot: ImageSlotParam;
  image: AdminImage | null;
  readOnly: boolean;
  removeLabel: string;
  onEditor: (editor: GuestPageEditor) => void;
}) {
  const t = useTranslations('guestPage.image');
  const tRoot = useTranslations();
  const format = useFormatter();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const api = useMemo(() => draftImageApi(collectionId, slot), [collectionId, slot]);
  const upload = useImageUpload(api, onEditor);
  const state = imageState(image, upload.phase);
  const remove = useMutation({
    mutationFn: () => removeDraftImage(collectionId, slot),
    onSuccess: onEditor,
    onError: (error) =>
      toast({
        variant: 'error',
        title: t('setFailed'),
        description: tRoot(imageErrorKey(isApiError(error) ? error.code : 'INTERNAL', 'remove')),
      }),
  });

  async function fromFrame(item: AdminContentItem) {
    try {
      onEditor(await setDraftImageFromFrame(collectionId, slot, item.id));
    } catch (error) {
      toast({
        variant: 'error',
        title: t('setFailed'),
        description: tRoot(imageErrorKey(isApiError(error) ? error.code : 'INTERNAL', 'frame')),
      });
      throw error;
    }
  }

  const failure =
    upload.phase.kind === 'failed'
      ? upload.phase.code === 'NETWORK' || upload.phase.code === 'STORAGE_403'
        ? t(`reason.${upload.phase.code}`)
        : tRoot(imageErrorKey(upload.phase.code, 'upload'))
      : null;
  const thumbnail = image?.status === 'READY' ? image.thumbnailUrl : null;

  return (
    <div className="grid gap-3" data-slot="image-control" data-image={slot} data-state={state}>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={cn(
            'grid aspect-[16/10] w-[7.5rem] shrink-0 place-items-center overflow-hidden rounded-frame bg-muted text-muted-foreground',
            state === 'uploading' && 'opacity-50',
          )}
        >
          {thumbnail === null ? (
            <ImageOff className="size-5" />
          ) : (
            // A presigned thumbnail: nothing for next/image to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt={DECORATIVE} className="size-full object-cover" />
          )}
        </div>
        <p className="min-w-0 text-sm" role="status">
          {state === 'uploading' && upload.phase.kind === 'uploading' ? (
            <span className="font-semibold">
              {t('uploading')}{' '}
              <span className="type-data tabular-nums">
                {format.number(upload.phase.progress / 100, { style: 'percent' })}
              </span>
            </span>
          ) : state === 'processing' ? (
            <span className="inline-flex items-center gap-2 font-semibold">
              <Spinner label={t('processing')} className="size-4 text-muted-foreground" />
              <span aria-hidden="true">{t('processing')}</span>
            </span>
          ) : state === 'failed' ? (
            <span className="text-destructive">{t('failed')}</span>
          ) : state === 'ready' ? (
            <span className="text-muted-foreground">{t('ready')}</span>
          ) : (
            <span className="text-muted-foreground">{t('none')}</span>
          )}
        </p>
      </div>

      {state === 'uploading' && upload.phase.kind === 'uploading' ? (
        <div className="grid gap-2">
          <Progress value={upload.phase.progress} label={t('uploading')} />
          <Button variant="outline" className="justify-self-start" onClick={upload.cancel}>
            {t('cancel')}
          </Button>
        </div>
      ) : null}

      {state === 'failed-upload' ? (
        <Alert
          variant="error"
          title={t('uploadFailed')}
          action={
            upload.phase.kind === 'failed' && upload.phase.retryable ? (
              <Button variant="outline" onClick={upload.retry}>
                <RotateCw aria-hidden="true" />
                {t('retry')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={upload.cancel}>
                {t('cancel')}
              </Button>
            )
          }
        >
          {failure}
        </Alert>
      ) : null}

      {readOnly || state === 'uploading' ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" />
            {t('upload')}
          </Button>
          <Button variant="outline" onClick={() => setPicking(true)}>
            <Images aria-hidden="true" />
            {t('pickFrame')}
          </Button>
          {image === null ? null : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={removeLabel}
              className="text-destructive hover:text-destructive"
              aria-disabled={remove.isPending || undefined}
              onClick={() => {
                if (!remove.isPending) remove.mutate();
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      {readOnly ? null : <p className="text-sm text-muted-foreground">{t('helper')}</p>}

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
          collectionId={collectionId}
          open={picking}
          onOpenChange={setPicking}
          onPicked={fromFrame}
        />
      )}
    </div>
  );
}

/** Decorative: the section's heading and status line say what the picture is. */
const DECORATIVE = '';
