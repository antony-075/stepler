import type { ErrorCode } from '@stepler/contracts';
import { errorMessageKey } from '@/errors/error-message';

/**
 * The message for a refused image change: an archived collection and a frame gone in the
 * meantime say so in plain words; anything else is the API's message for the code.
 */
export function imageErrorKey(
  code: ErrorCode,
  source: 'upload' | 'frame' | 'remove',
): `errors.${ErrorCode}` | 'guestPage.image.archivedRefused' | 'guestPage.image.frameGone' {
  if (code === 'COLLECTION_ARCHIVED') return 'guestPage.image.archivedRefused';
  if (code === 'NOT_FOUND' && source === 'frame') return 'guestPage.image.frameGone';
  return errorMessageKey(code);
}
