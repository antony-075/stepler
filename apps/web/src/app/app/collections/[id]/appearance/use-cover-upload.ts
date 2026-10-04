'use client';

import { type Collection, type CollectionDetail, fileTypeFor } from '@stepler/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { collectionKey, coverUploadApi, useInvalidateCollections } from '@/api/collections';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { isApiError } from '@/api/client';
import { isRetryable, type UploadErrorCode } from '@/guest/upload/queue';
import {
  createUploadTransport,
  TransferError,
  type UploadTransport,
} from '@/guest/upload/transport';
import type { UploadPhase } from './cover-state';

// The admin's cover file, browser → storage (plan [A1], spec §10.2): one file through the same
// transport as a guest's (multipart, part retries, completion by the server), against the admin
// cover routes. No queue: one file, «Скасувати» while it goes, «Повторити» after a retryable
// failure with the same `clientUploadId` (a lost answer then finds the upload it completed).
// Only the type is checked here; the size limit is the API's answer (`FILE_TOO_LARGE`).

/** Progress updates at most this often (DESIGN-SYSTEM.md §8: ≤ 4 a second). */
const PROGRESS_INTERVAL_MS = 250;

const defaultTransport = createUploadTransport();

export interface CoverUpload {
  phase: UploadPhase;
  /** Starts sending a picked file; a file that is not a photo fails at once, nothing sent. */
  start: (file: File) => void;
  /** «Повторити» after a retryable failure. */
  retry: () => void;
  /** «Скасувати» while it goes, or dismisses a failure. */
  cancel: () => void;
}

export function useCoverUpload(
  collectionId: string,
  onUploaded: (collection: Collection) => void,
  transport: UploadTransport = defaultTransport,
): CoverUpload {
  const t = useTranslations('appearance.cover');
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
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
        coverUploadApi(collectionId),
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
        async (collection) => {
          if (abort.signal.aborted) return;
          controller.current = null;
          attempt.current = null;
          // The detail also holds the storage line, which the answer leaves out.
          queryClient.setQueryData<CollectionDetail>(collectionKey(collectionId), (previous) =>
            previous === undefined ? undefined : { ...previous, ...collection },
          );
          setPhase({ kind: 'idle' });
          done.current(collection);
          await invalidate();
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
          // Archived meanwhile: the tab turns read-only once the collection is fetched again.
          if (code === 'COLLECTION_ARCHIVED') void invalidate();
        },
      );
  }, [collectionId, invalidate, queryClient, transport]);

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
