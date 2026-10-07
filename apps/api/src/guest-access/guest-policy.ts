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

/**
 * Reporting (slice 9, R1): another guest's frame the guest can see. Their own frame is `own`
 * (403); one they cannot see is `invisible` (404, like one that does not exist).
 */
export const canReportItem = (
  p: GuestPrincipal,
  item: ItemOwnership,
): 'ok' | 'own' | 'invisible' => {
  if (isOwnItem(p, item)) return 'own';
  return canSeeItem(p, item) ? 'ok' : 'invisible';
};

/** The link lets its guests delete what they added themselves [C15]. */
export const canDeleteOwn = (p: GuestPrincipal): boolean => p.link.permissions.canDeleteOwn;

export const canDeleteItem = (p: GuestPrincipal, item: ItemOwnership): boolean =>
  isOwnItem(p, item) && canDeleteOwn(p);
