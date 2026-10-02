import { Logger } from '@nestjs/common';
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

const logger = new Logger('GuestLinkDto');

/**
 * The live token, or `null` when it cannot be decrypted (a changed APP_SECRET, a tampered row).
 * One unreadable link must not break the list, or the owner could not rotate or revoke it.
 */
function revealOrNull(row: GuestLinkRow, tokens: GuestLinkTokens): string | null {
  try {
    return tokens.reveal(row);
  } catch {
    logger.warn({
      msg: 'Guest link token cannot be decrypted',
      linkId: row.id,
      tokenKeyId: row.tokenKeyId,
    });
    return null;
  }
}

/**
 * Explicit mapping: the token hash, ciphertext, key id and rotation pointer never reach the API.
 * `url` is decrypted for live links only; a revoked link has none, and neither has a live link
 * whose token cannot be decrypted (rotate or revoke it to get a working one).
 */
export function toGuestLinkDto(row: GuestLinkRow, tokens: GuestLinkTokens): GuestLink {
  const token = revealOrNull(row, tokens);
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
