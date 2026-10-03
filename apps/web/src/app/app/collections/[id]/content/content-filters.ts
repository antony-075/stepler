import type { AdminContentSort, ContentKind } from '@stepler/contracts';

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
