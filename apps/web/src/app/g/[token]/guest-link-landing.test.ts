import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { guestLinkState } from './guest-link-state';

describe('guestLinkState', () => {
  it.each([
    ['NOT_FOUND', 404, 'not-found'],
    ['VALIDATION_FAILED', 400, 'not-found'],
    ['COLLECTION_UNAVAILABLE', 410, 'unavailable'],
    ['LINK_REVOKED', 410, 'revoked'],
    ['COLLECTION_ARCHIVED', 403, 'archived'],
    ['LINK_INACTIVE', 403, 'paused'],
    ['RATE_LIMITED', 429, 'rate-limited'],
    ['INTERNAL', 500, 'failed'],
    ['UPSTREAM_UNAVAILABLE', 0, 'failed'],
  ] as const)('%s → %s', (code, status, state) => {
    expect(guestLinkState(new ApiError(code, status))).toBe(state);
  });

  it('treats anything that is not an API error as a failure', () => {
    expect(guestLinkState(new Error('boom'))).toBe('failed');
  });
});
