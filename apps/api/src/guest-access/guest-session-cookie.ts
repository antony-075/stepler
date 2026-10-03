import type { ServerResponse } from 'node:http';
import type { ApiEnv } from '../config/env.js';
import { serializeCookie } from '../auth/session-cookie.js';

export const GUEST_SESSION_COOKIE = 'st_gs';

/**
 * 400 days, the browsers' cap on cookie lifetime. The session has no server-side expiry (D12),
 * and every exchange renews the cookie.
 */
export const GUEST_SESSION_MAX_AGE_SECONDS = 400 * 24 * 3600;

/**
 * One cookie per collection, sent only to that collection's guest routes (ADR 0007): a device
 * that visited several collections never sends one collection's session to another [C3].
 */
export const guestCookiePath = (collectionId: string): string =>
  `/api/v1/guest/collections/${collectionId}`;

export function setGuestSessionCookie(
  res: ServerResponse,
  token: string,
  collectionId: string,
  env: ApiEnv,
): void {
  res.appendHeader(
    'Set-Cookie',
    serializeCookie(GUEST_SESSION_COOKIE, token, {
      path: guestCookiePath(collectionId),
      maxAgeSeconds: GUEST_SESSION_MAX_AGE_SECONDS,
      secure: env.COOKIE_SECURE,
    }),
  );
}
