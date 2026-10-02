import { type ResolveGuestLinkResponse, resolveGuestLinkResponseSchema } from '@stepler/contracts';
import { apiRequest } from './client';

/**
 * What a guest may learn about a live link (G6). The token goes in the body, never in a URL the
 * API logs; the call is a same-origin POST, so the browser's `Origin` passes the CSRF check.
 * Slice 3 replaces it with `POST /guest/sessions`.
 */
export const resolveGuestLink = (linkToken: string): Promise<ResolveGuestLinkResponse> =>
  apiRequest('/guest/links/resolve', {
    method: 'POST',
    body: { linkToken },
    schema: resolveGuestLinkResponseSchema,
  });
