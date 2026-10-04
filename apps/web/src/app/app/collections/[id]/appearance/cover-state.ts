import type { Collection } from '@stepler/contracts';
import type { UploadErrorCode } from '@/guest/upload/queue';

/** The admin's cover file on its way to storage (one file, no queue). */
export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'failed'; code: UploadErrorCode; retryable: boolean };

export type CoverState = 'none' | 'uploading' | 'failed-upload' | 'processing' | 'failed' | 'ready';

/**
 * What the cover card shows: an upload in progress (or its failure) wins over the cover the
 * collection has now, which stays until the new one completes; then the cover's own status.
 */
export function coverState(cover: Collection['cover'], upload: UploadPhase): CoverState {
  if (upload.kind === 'uploading') return 'uploading';
  if (upload.kind === 'failed') return 'failed-upload';
  if (cover === null) return 'none';
  if (cover.status === 'PENDING') return 'processing';
  if (cover.status === 'FAILED') return 'failed';
  return 'ready';
}
