import { isApiError } from '@/api/client';

export type GuestLinkState =
  'not-found' | 'unavailable' | 'revoked' | 'archived' | 'paused' | 'rate-limited' | 'failed';

/**
 * The page a guest sees when a link does not open (G5). A malformed token (`VALIDATION_FAILED`)
 * reads like an unknown one, so the page never tells them apart.
 */
export function guestLinkState(error: unknown): GuestLinkState {
  if (!isApiError(error)) return 'failed';
  switch (error.code) {
    case 'NOT_FOUND':
    case 'VALIDATION_FAILED':
      return 'not-found';
    case 'COLLECTION_UNAVAILABLE':
      return 'unavailable';
    case 'LINK_REVOKED':
      return 'revoked';
    case 'COLLECTION_ARCHIVED':
      return 'archived';
    case 'LINK_INACTIVE':
      return 'paused';
    case 'RATE_LIMITED':
      return 'rate-limited';
    default:
      return 'failed';
  }
}
