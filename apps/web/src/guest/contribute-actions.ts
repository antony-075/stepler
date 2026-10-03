import type { GuestLinkPermissions } from '@stepler/contracts';

/**
 * The guest's main action (DESIGN-SYSTEM.md §6.1): files when the link takes any, else a wish,
 * else nothing (a view-only link has no dock).
 */
export function primaryContribution(p: GuestLinkPermissions): 'files' | 'text' | null {
  if (p.canUploadPhotos || p.canUploadVideos || p.canUploadDocuments) return 'files';
  if (p.canSubmitText) return 'text';
  return null;
}

// What the picker offers per permission (D3). The server checks the bytes; this only narrows
// the picker. HEIC is listed by extension: browsers report it inconsistently as a MIME type.
const ACCEPT = {
  canUploadPhotos: ['image/*', '.heic', '.heif'],
  canUploadVideos: ['video/mp4', 'video/quicktime', 'video/webm'],
  canUploadDocuments: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt'],
} as const;

/** The file input's `accept` for the kinds this link takes. */
export function acceptFor(p: GuestLinkPermissions): string {
  return (Object.keys(ACCEPT) as (keyof typeof ACCEPT)[])
    .filter((permission) => p[permission])
    .flatMap((permission) => ACCEPT[permission])
    .join(',');
}
