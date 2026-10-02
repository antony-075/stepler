import {
  type CreateGuestLinkRequest,
  type GuestLink,
  type GuestLinkListResponse,
  guestLinkListResponseSchema,
  guestLinkSchema,
  type UpdateGuestLinkRequest,
} from '@stepler/contracts';
import { apiRequest } from './client';

/**
 * Under the collection's own key, so `useInvalidateCollections()` (which refetches everything
 * under `['collections']`) also refreshes the links and the dashboard's link status.
 */
export const guestLinksKey = (collectionId: string) =>
  ['collections', 'detail', collectionId, 'guest-links'] as const;

const collectionPath = (collectionId: string) =>
  `/collections/${encodeURIComponent(collectionId)}/guest-links`;
const linkPath = (id: string) => `/guest-links/${encodeURIComponent(id)}`;

/** The default link first, then live additional links, then recently revoked ones. */
export const listGuestLinks = (collectionId: string): Promise<GuestLinkListResponse> =>
  apiRequest(collectionPath(collectionId), { schema: guestLinkListResponseSchema });

export const createGuestLink = (
  collectionId: string,
  body: CreateGuestLinkRequest,
): Promise<GuestLink> =>
  apiRequest(collectionPath(collectionId), { method: 'POST', body, schema: guestLinkSchema });

export const updateGuestLink = (id: string, body: UpdateGuestLinkRequest): Promise<GuestLink> =>
  apiRequest(linkPath(id), { method: 'PATCH', body, schema: guestLinkSchema });

export const deactivateGuestLink = (id: string): Promise<GuestLink> =>
  apiRequest(`${linkPath(id)}/deactivate`, { method: 'POST', schema: guestLinkSchema });

export const activateGuestLink = (id: string): Promise<GuestLink> =>
  apiRequest(`${linkPath(id)}/activate`, { method: 'POST', schema: guestLinkSchema });

export const revokeGuestLink = (id: string): Promise<GuestLink> =>
  apiRequest(`${linkPath(id)}/revoke`, { method: 'POST', schema: guestLinkSchema });

/**
 * Deletes an additional link: revoked if it is still live, and no longer listed (the record
 * stays on the server for the audit trail). Also removes a revoked link from the list.
 */
export const deleteGuestLink = (id: string): Promise<void> =>
  apiRequest(linkPath(id), { method: 'DELETE' });

/** A retried or doubled rotate returns the current default instead of rotating twice. */
export const rotateDefaultLink = (
  collectionId: string,
  expectedLinkId: string,
): Promise<GuestLink> =>
  apiRequest(`${collectionPath(collectionId)}/default/rotate`, {
    method: 'POST',
    body: { expectedLinkId },
    schema: guestLinkSchema,
  });
