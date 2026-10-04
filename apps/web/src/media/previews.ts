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

/** At most this many waiting frames are refreshed per round (each is one request). */
export const PREVIEW_POLL_MAX = 12;

interface Waiting {
  processingStatus: ProcessingStatus;
  createdAt: string;
}

/** Whether a frame is still worth asking about. */
export const awaitsPreview = (item: Waiting, now: number = Date.now()): boolean =>
  item.processingStatus === 'PENDING' && now - Date.parse(item.createdAt) < PREVIEW_WAIT_MS;

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
