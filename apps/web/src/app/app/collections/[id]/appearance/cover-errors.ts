import type { ErrorCode } from '@stepler/contracts';
import { errorMessageKey } from '@/errors/error-message';

/**
 * The message for a refused cover change: an archived collection and a frame gone in the
 * meantime say so in plain words; anything else is the API's message for the code.
 */
export function coverErrorKey(
  code: ErrorCode,
  source: 'upload' | 'frame' | 'remove',
): `errors.${ErrorCode}` | 'appearance.cover.archivedRefused' | 'appearance.cover.frameGone' {
  if (code === 'COLLECTION_ARCHIVED') return 'appearance.cover.archivedRefused';
  if (code === 'NOT_FOUND' && source === 'frame') return 'appearance.cover.frameGone';
  return errorMessageKey(code);
}
