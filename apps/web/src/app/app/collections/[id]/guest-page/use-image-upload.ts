'use client';

import { fileTypeFor, type GuestPageEditor } from '@stepler/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { isApiError } from '@/api/client';
import { isRetryable, type UploadErrorCode } from '@/guest/upload/queue';
import {
  createUploadTransport,
  TransferError,
  type UploadApi,
  type UploadTransport,
} from '@/guest/upload/transport';

// One admin image file (the draft's cover or background), browser → storage (spec §10.2, §10.7):
// the same transport as a guest's (multipart, part retries, completion by the server) against
// the draft image routes, whose completion answers the whole editor state. No queue: one file,
// «Скасувати» while it goes, «Повторити» after a retryable failure with the same
// `clientUploadId` (a lost answer then finds the upload it completed). Only the type is checked
// here; the size limit is the API's answer (`FILE_TOO_LARGE`).

/** Where one image upload is. */
export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'failed'; code: UploadErrorCode; retryable: boolean };

/** Progress updates at most this often (DESIGN-SYSTEM.md §8: ≤ 4 a second). */
const PROGRESS_INTERVAL_MS = 250;

const defaultTransport = createUploadTransport();

export interface ImageUpload {
  phase: UploadPhase;
  /** Starts sending a picked file; a file that is not a photo fails at once, nothing sent. */
  start: (file: File) => void;
  /** «Повторити» after a retryable failure. */
  retry: () => void;
  /** «Скасувати» while it goes, or dismisses a failure. */
  cancel: () => void;
}

export function useImageUpload(
  api: UploadApi<GuestPageEditor>,
  onUploaded: (editor: GuestPageEditor) => void,
  transport: UploadTransport = defaultTransport,
): ImageUpload {
  const t = useTranslations('guestPage.image');
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const attempt = useRef<{ file: File; clientUploadId: string; uploadId?: string } | null>(null);
  const done = useRef(onUploaded);
  useEffect(() => {
    done.current = onUploaded;
  });

  useLeaveGuard(phase.kind === 'uploading', t('leave'));

  // Leaving the tab mid-upload stops it (the server discards what arrived).
  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(() => {
    const item = attempt.current;
    if (item === null) return;
    const abort = new AbortController();
    controller.current = abort;
    setPhase({ kind: 'uploading', progress: 0 });
    let last = 0;
    transport
      .upload(
        item,
        api,
        abort.signal,
        (loaded) => {
          const now = Date.now();
          if (now - last < PROGRESS_INTERVAL_MS && loaded < item.file.size) return;
          last = now;
          setPhase({
            kind: 'uploading',
            progress: Math.min(100, Math.round((loaded / item.file.size) * 100)),
          });
        },
        {
          onInitiated: (uploadId) => {
            item.uploadId = uploadId;
          },
        },
      )
      .then(
        (editor) => {
          if (abort.signal.aborted) return;
          controller.current = null;
          attempt.current = null;
          setPhase({ kind: 'idle' });
          done.current(editor);
        },
        (error: unknown) => {
          if (abort.signal.aborted) return;
          controller.current = null;
          const code: UploadErrorCode =
            error instanceof TransferError
              ? error.code
              : isApiError(error)
                ? error.code
                : 'INTERNAL';
          setPhase({ kind: 'failed', code, retryable: isRetryable(code) });
        },
      );
  }, [api, transport]);

  const start = useCallback(
    (file: File) => {
      controller.current?.abort();
      if (fileTypeFor(file.name, file.type)?.kind !== 'PHOTO') {
        attempt.current = null;
        setPhase({ kind: 'failed', code: 'FILE_TYPE_NOT_ALLOWED', retryable: false });
        return;
      }
      attempt.current = { file, clientUploadId: crypto.randomUUID() };
      send();
    },
    [send],
  );

  const retry = useCallback(() => {
    if (attempt.current !== null) send();
  }, [send]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    attempt.current = null;
    setPhase({ kind: 'idle' });
  }, []);

  return { phase, start, retry, cancel };
}
