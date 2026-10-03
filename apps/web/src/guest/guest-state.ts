import { isApiError } from '@/api/client';

/** What the guest page shows instead of the collection when something stops it. */
export type GuestPageState =
  | 'not-found'
  | 'unavailable'
  | 'revoked'
  | 'archived'
  | 'paused'
  | 'quota-full'
  | 'rate-limited'
  | 'failed';

/**
 * The full-page state for an error from any guest call (G5): the link and collection states
 * keep their precedence, whichever call met them first. A malformed token (`VALIDATION_FAILED`)
 * reads like an unknown one. `GUEST_SESSION_REQUIRED` is retried once by the session (see
 * `withSessionRetry`); reaching here, it is a failure.
 */
export function guestPageState(error: unknown): GuestPageState {
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
    case 'QUOTA_EXCEEDED':
      return 'quota-full';
    case 'RATE_LIMITED':
      return 'rate-limited';
    default:
      return 'failed';
  }
}

/** Errors that end the page (the link or collection changed), as opposed to one failed action. */
export function isPageEndingError(error: unknown): boolean {
  const state = guestPageState(error);
  return state !== 'failed' && state !== 'rate-limited' && state !== 'not-found';
}
