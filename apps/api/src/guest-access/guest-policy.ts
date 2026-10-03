import type { GuestPrincipal } from '../auth/principal.js';

/** Who contributed an item; `null` once the session row is gone (then it is nobody's own). */
export interface ItemOwnership {
  contributorGuestSessionId: string | null;
}

export type UploadKind = 'PHOTO' | 'VIDEO' | 'DOCUMENT';

const UPLOAD_PERMISSION = {
  PHOTO: 'canUploadPhotos',
  VIDEO: 'canUploadVideos',
  DOCUMENT: 'canUploadDocuments',
} as const;

/**
 * What a guest may do, from the permissions of the link their session is bound to now
 * (re-read on every request). Pure, so the rules are tested once and shared by every service.
 */
export const canUploadKind = (p: GuestPrincipal, kind: UploadKind): boolean =>
  p.link.permissions[UPLOAD_PERMISSION[kind]];

export const canSubmitText = (p: GuestPrincipal): boolean => p.link.permissions.canSubmitText;

/** The shared gallery: everyone's items, not only the guest's own. */
export const canListAll = (p: GuestPrincipal): boolean => p.link.permissions.canViewGallery;

export const isOwnItem = (p: GuestPrincipal, item: ItemOwnership): boolean =>
  item.contributorGuestSessionId === p.guestSessionId;

export const canSeeItem = (p: GuestPrincipal, item: ItemOwnership): boolean =>
  isOwnItem(p, item) || canListAll(p);

export const canDeleteItem = (p: GuestPrincipal, item: ItemOwnership): boolean =>
  isOwnItem(p, item) && p.link.permissions.canDeleteOwn;
