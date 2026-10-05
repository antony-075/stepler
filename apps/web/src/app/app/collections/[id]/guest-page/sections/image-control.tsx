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
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ImageOff,
  Images,
  LoaderCircle,
  RotateCw,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { contentListKey } from '@/api/content';
import {
  draftImageApi,
  guestPageKey,
  removeDraftImage,
  setDraftImageFromFrame,
} from '@/api/collections';
import { FramePicker } from '../frame-picker';
import { imageErrorKey } from '../image-errors';
import { imageState } from '../image-state';
import { useImageUpload } from '../use-image-upload';

/** What the file picker offers: the photo types the API takes for an admin image. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.heic,.heif';

/**
 * Preparing an image takes seconds; past this it is not normal any more (the worker is down or
 * far behind, owner remark 81): the tile says so and offers to check again or remove it.
 */
export const SLOW_PROCESSING_MS = 2 * 60_000;

/**
 * One draft image (cover or background), as in E-editor, redesigned for owner remarks 74 and 81
 * (2026-10-05). A 16:10 tile with the picture or its state on the left; beside it what is
 * happening in words, with «Видалити» once there is an image (a quiet destructive text button,
 * aligned with the words, never on a line of its own); under them «Завантажити» (ink) and
 * «Вибрати з кадрів» (outline), then the file types. The states keep the tile's box in place:
 * - none: a quiet tile, «Немає обкладинки» and what guests see without one;
 * - uploading: the tile dims, the percent in mono, a progress line and «Скасувати»;
 * - a failed transfer: why, with «Повторити»;
 * - processing: a spinner on the tile, «Готується…» (the editor asks again every 10 s); after
 *   `SLOW_PROCESSING_MS`, «Обробка триває довше, ніж зазвичай» with «Перевірити ще раз»;
 * - failed: a warning on the tile, «Не вдалося обробити — спробуйте інше зображення»;
 * - ready: the picture.
 * Each change answers the whole editor state (`onEditor`); the working copy is not touched, and
 * the draft's revision does not move.
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
  const queryClient = useQueryClient();
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
      const code = isApiError(error) ? error.code : 'INTERNAL';
      toast({
        variant: 'error',
        title: t('setFailed'),
        description: tRoot(imageErrorKey(code, 'frame')),
      });
      // The frame is gone or cannot be used: the picker shows the photos as they are now, and
      // the editor the draft as the server has it (nothing changed there).
      if (code === 'NOT_FOUND' || code === 'COVER_SOURCE_INVALID') {
        void queryClient.invalidateQueries({
          queryKey: contentListKey(collectionId, 'PHOTO', 'newest'),
        });
      }
      void queryClient.invalidateQueries({ queryKey: guestPageKey(collectionId) });
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
  const canRemove = image !== null && !readOnly && state !== 'uploading';
  const removeButton = canRemove ? (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 justify-self-start text-destructive hover:text-destructive pointer-coarse:min-h-11"
      aria-label={removeLabel}
      aria-disabled={remove.isPending || undefined}
      onClick={() => {
        if (!remove.isPending) remove.mutate();
      }}
    >
      <Trash2 aria-hidden="true" />
      {t('remove')}
    </Button>
  ) : null;

  return (
    <div className="grid gap-4" data-slot="image-control" data-image={slot} data-state={state}>
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3">
        <div
          aria-hidden="true"
          data-slot="image-tile"
          className={cn(
            'relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-frame border bg-muted text-muted-foreground',
            state === 'failed' && 'border-destructive/40 bg-destructive-soft text-destructive',
          )}
        >
          {thumbnail === null ? (
            state === 'failed' ? (
              <TriangleAlert className="size-5" />
            ) : state === 'processing' ? (
              <LoaderCircle className="size-5 motion-safe:animate-spin" />
            ) : (
              <ImageOff className="size-5" />
            )
          ) : (
            // A presigned thumbnail: nothing for next/image to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt={DECORATIVE} className="size-full object-cover" />
          )}
          {state === 'uploading' ? <span className="absolute inset-0 bg-(--veil)" /> : null}
        </div>
        <div className="grid min-w-0 gap-1 pt-0.5" role="status">
          {state === 'uploading' && upload.phase.kind === 'uploading' ? (
            <>
              <Line strong>
                {t('uploading')}{' '}
                <span className="type-data tabular-nums">
                  {format.number(upload.phase.progress / 100, { style: 'percent' })}
                </span>
              </Line>
              <Progress value={upload.phase.progress} label={t('uploading')} />
            </>
          ) : state === 'processing' ? (
            <Processing
              onCheck={() =>
                void queryClient.invalidateQueries({ queryKey: guestPageKey(collectionId) })
              }
            />
          ) : state === 'failed' ? (
            <Line tone="destructive" strong>
              {t('failed')}
            </Line>
          ) : state === 'ready' ? (
            <Line strong>{t('ready')}</Line>
          ) : state === 'none' ? (
            <>
              <Line strong>{t(NONE[slot])}</Line>
              {slot === 'cover' ? <Line tone="muted">{t('noneCoverText')}</Line> : null}
            </>
          ) : (
            // A failed transfer: the alert below says why; the image the draft has stays.
            <Line strong>{image !== null ? t('ready') : t(NONE[slot])}</Line>
          )}
          {state === 'uploading' ? null : removeButton}
        </div>
      </div>

      {state === 'uploading' ? (
        <Button variant="outline" className="justify-self-start" onClick={upload.cancel}>
          {t('cancel')}
        </Button>
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
        <div className="grid gap-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
            <Button onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" />
              {image === null ? t('upload') : t('replace')}
            </Button>
            <Button variant="outline" onClick={() => setPicking(true)}>
              <Images aria-hidden="true" />
              {t('pickFrame')}
            </Button>
          </div>
          <p className="type-caption text-muted-foreground">{t('helper')}</p>
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
          collectionId={collectionId}
          open={picking}
          onOpenChange={setPicking}
          onPicked={fromFrame}
        />
      )}
    </div>
  );
}

function Line({
  children,
  strong = false,
  tone,
}: {
  children: ReactNode;
  strong?: boolean;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <p
      className={cn('text-sm text-pretty', {
        'font-semibold': strong,
        'text-muted-foreground': tone === 'muted',
        'text-destructive': tone === 'destructive',
      })}
    >
      {children}
    </p>
  );
}

/**
 * «Готується…», and once it has taken longer than `SLOW_PROCESSING_MS` since this editor first
 * saw it, the slow state with «Перевірити ще раз». Mounted only while the image is processing,
 * so its clock starts over for the next image.
 */
function Processing({ onCheck }: { onCheck: () => void }) {
  const t = useTranslations('guestPage.image');
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) {
    return (
      <>
        <Line strong>{t('processing')}</Line>
        <Line tone="muted">{t('processingText')}</Line>
      </>
    );
  }
  return (
    <>
      <Line strong>{t('slow')}</Line>
      <Line tone="muted">{t('slowText')}</Line>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 justify-self-start text-link pointer-coarse:min-h-11"
        onClick={onCheck}
      >
        <RotateCw aria-hidden="true" />
        {t('check')}
      </Button>
    </>
  );
}

/** The empty state's line per slot. */
const NONE = { cover: 'noneCover', background: 'noneBackground' } as const satisfies Record<
  ImageSlotParam,
  string
>;

/** Decorative: the status line says what the picture is. */
const DECORATIVE = '';
