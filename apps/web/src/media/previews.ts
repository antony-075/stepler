import type { ProcessingStatus } from '@stepler/contracts';

// Photos and videos get their thumbnail, preview and poster from the worker a few seconds after
// they arrive (media processing, spec §11). Grids ask again while any frame on screen waits.

/** How often a grid asks again while one of its frames still waits for its preview. */
export const PREVIEW_POLL_MS = 10_000;

/**
 * Frames older than this stop being asked about: the worker is down or far behind, and the
 * admin's «Оновити» (or a reload) still brings them.
 */
export const PREVIEW_WAIT_MS = 30 * 60_000;

/**
 * Guests stop asking sooner (processing takes seconds) and less often, with jitter: everyone at a
 * venue may share one IP and its guest read limit (`LIMIT_GUEST_READS_PER_IP_PER_MINUTE`, 600).
 * At 15–20 s a waiting guest makes 3–4 reads a minute, so ~150 guests can wait at once.
 */
export const GUEST_PREVIEW_WAIT_MS = 10 * 60_000;
const GUEST_POLL_MS = 15_000;
const GUEST_POLL_JITTER_MS = 5_000;

/** The next guest poll delay: 15–20 s. */
export const guestPollDelay = (random: () => number = Math.random): number =>
  GUEST_POLL_MS + Math.round(random() * GUEST_POLL_JITTER_MS);

/** At most this many waiting frames are refreshed per round (each is one request). */
export const PREVIEW_POLL_MAX = 12;

interface Waiting {
  processingStatus: ProcessingStatus;
  createdAt: string;
}

/** Whether a frame is still worth asking about. */
export const awaitsPreview = (
  item: Waiting,
  now: number = Date.now(),
  waitMs: number = PREVIEW_WAIT_MS,
): boolean => item.processingStatus === 'PENDING' && now - Date.parse(item.createdAt) < waitMs;

/**
 * What a photo or video frame shows in a grid: its thumbnail (480 px, for videos too), the
 * worker's verdict that there will be none, or the wait. Never the original (50 MB, or 2 GB).
 */
export type GridPicture =
  { kind: 'thumbnail'; url: string } | { kind: 'failed' } | { kind: 'pending' };

export function gridPicture(item: {
  thumbnailUrl: string | null;
  processingStatus: ProcessingStatus;
}): GridPicture {
  if (item.thumbnailUrl !== null) return { kind: 'thumbnail', url: item.thumbnailUrl };
  return item.processingStatus === 'FAILED' ? { kind: 'failed' } : { kind: 'pending' };
}
