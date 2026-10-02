import type { GuestLink, GuestLinkPermissions } from '@stepler/contracts';
import type { GuestLink as GuestLinkRow } from '../generated/prisma/client.js';
import type { GuestLinkTokens } from './guest-link-tokens.js';

/** [G3] Contribution-only: guests do not see each other's content until the admin opts in. */
export const DEFAULT_LINK_PERMISSIONS: GuestLinkPermissions = {
  canUploadFiles: true,
  canSubmitText: true,
  canViewGallery: false,
  canDeleteOwn: true,
};

export function permissionsOf(row: GuestLinkRow): GuestLinkPermissions {
  return {
    canUploadFiles: row.canUploadFiles,
    canSubmitText: row.canSubmitText,
    canViewGallery: row.canViewGallery,
    canDeleteOwn: row.canDeleteOwn,
  };
}

/**
 * Explicit mapping: the token hash, ciphertext, key id and rotation pointer never reach the API.
 * `url` is decrypted for live links only; a revoked link has none.
 */
export function toGuestLinkDto(row: GuestLinkRow, tokens: GuestLinkTokens): GuestLink {
  const token = tokens.reveal(row);
  return {
    id: row.id,
    isDefault: row.isDefault,
    label: row.label,
    status: row.status,
    permissions: permissionsOf(row),
    url: token === null ? null : tokens.urlFor(token),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
