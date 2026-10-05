import type { AdminImage } from '@stepler/contracts';
import type { UploadPhase } from './use-image-upload';

export type ImageState = 'none' | 'uploading' | 'failed-upload' | 'processing' | 'failed' | 'ready';

/**
 * What an image section shows: an upload in progress (or its failure) wins over the image the
 * draft has now, which stays until the new one completes; then the image's own status.
 */
export function imageState(image: AdminImage | null, upload: UploadPhase): ImageState {
  if (upload.kind === 'uploading') return 'uploading';
  if (upload.kind === 'failed') return 'failed-upload';
  if (image === null) return 'none';
  if (image.status === 'PENDING') return 'processing';
  if (image.status === 'FAILED') return 'failed';
  return 'ready';
}
