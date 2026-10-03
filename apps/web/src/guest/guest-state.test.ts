import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { guestPageState, isPageEndingError } from './guest-state';

describe('guestPageState', () => {
  it.each([
    ['NOT_FOUND', 404, 'not-found'],
    ['VALIDATION_FAILED', 400, 'not-found'],
    ['COLLECTION_UNAVAILABLE', 410, 'unavailable'],
    ['LINK_REVOKED', 410, 'revoked'],
    ['COLLECTION_ARCHIVED', 403, 'archived'],
    ['LINK_INACTIVE', 403, 'paused'],
    ['QUOTA_EXCEEDED', 409, 'quota-full'],
    ['RATE_LIMITED', 429, 'rate-limited'],
    ['GUEST_SESSION_REQUIRED', 401, 'failed'],
    ['FORBIDDEN', 403, 'failed'],
    ['INTERNAL', 500, 'failed'],
    ['UPSTREAM_UNAVAILABLE', 0, 'failed'],
  ] as const)('%s → %s', (code, status, state) => {
    expect(guestPageState(new ApiError(code, status))).toBe(state);
  });

  it('treats anything that is not an API error as a failure', () => {
    expect(guestPageState(new Error('boom'))).toBe('failed');
  });

  it('only link and collection states end the page; one failed action does not', () => {
    expect(isPageEndingError(new ApiError('LINK_INACTIVE', 403))).toBe(true);
    expect(isPageEndingError(new ApiError('LINK_REVOKED', 410))).toBe(true);
    expect(isPageEndingError(new ApiError('QUOTA_EXCEEDED', 409))).toBe(true);
    expect(isPageEndingError(new ApiError('RATE_LIMITED', 429))).toBe(false);
    expect(isPageEndingError(new ApiError('INTERNAL', 500))).toBe(false);
    expect(isPageEndingError(new ApiError('NOT_FOUND', 404))).toBe(false);
  });
});
