import type {
  AdminContentSort,
  ContentCounts,
  ContentKind,
  GuestLink,
  GuestLinkPermissions,
} from '@stepler/contracts';

/** The filter chips in order; the URL carries the lower-case name (`?kind=text`). */
export const KIND_FILTERS = ['all', 'photo', 'video', 'document', 'text'] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

const KINDS: Record<Exclude<KindFilter, 'all'>, ContentKind> = {
  photo: 'PHOTO',
  video: 'VIDEO',
  document: 'DOCUMENT',
  text: 'TEXT',
};

/** `?kind=…` to the API's kind; anything unknown is no filter. */
export function kindFromParam(value: string | null): ContentKind | undefined {
  return value !== null && Object.hasOwn(KINDS, value)
    ? KINDS[value as keyof typeof KINDS]
    : undefined;
}

export function filterOf(kind: ContentKind | undefined): KindFilter {
  return kind === undefined ? 'all' : (kind.toLowerCase() as KindFilter);
}

/** `?reported=1`: only frames with open reports («Скарги», slice 9); anything else is all. */
export function reportedFromParam(value: string | null): boolean {
  return value === '1';
}

/** `?frame=86` opens the viewer on frame 86; anything but a positive integer is nothing. */
export function frameFromParam(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d{0,8}$/.test(value)) return undefined;
  return Number(value);
}

/** `?sort=frame` orders by frame number [C5]; newest first otherwise. */
export function sortFromParam(value: string | null): AdminContentSort {
  return value === 'frame' ? 'frame' : 'newest';
}

/** Frames added since the admin last looked: never negative (deletions lower the total). */
export function newFramesCount(shownTotal: number | null, total: number | undefined): number {
  if (shownTotal === null || total === undefined) return 0;
  return Math.max(0, total - shownTotal);
}

/** The permission that lets guests add each type ([C5]: texts are `canSubmitText`). */
const ALLOWED_BY: Record<Exclude<KindFilter, 'all'>, keyof GuestLinkPermissions> = {
  photo: 'canUploadPhotos',
  video: 'canUploadVideos',
  document: 'canUploadDocuments',
  text: 'canSubmitText',
};

/**
 * Type chips shown locked (owner review 2026-10-03): no live link (not revoked; a paused link
 * can be resumed) lets guests add that type, and the collection has none of it. A type with
 * frames stays open. Nothing is locked until both the links and the counts have loaded.
 */
export function lockedFilters(
  links: readonly Pick<GuestLink, 'status' | 'permissions'>[] | undefined,
  counts: Pick<ContentCounts, Exclude<KindFilter, 'all'>> | undefined,
): Set<KindFilter> {
  const locked = new Set<KindFilter>();
  if (links === undefined || counts === undefined) return locked;
  const live = links.filter((link) => link.status !== 'REVOKED');
  for (const [filter, permission] of Object.entries(ALLOWED_BY) as [
    Exclude<KindFilter, 'all'>,
    keyof GuestLinkPermissions,
  ][]) {
    if (counts[filter] === 0 && !live.some((link) => link.permissions[permission])) {
      locked.add(filter);
    }
  }
  return locked;
}
