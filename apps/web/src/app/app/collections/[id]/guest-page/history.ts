import { type EditorWorking, type ImageIds, sameImages, sameWorking } from './editor-state';

// The editor's undo / redo (owner remark 113): a per-session history of the working copy and the
// draft's images. Pure; the hook (`use-guest-page-editor.ts`) applies a step.
// - A change is one step. Changes with the same `key` within `COALESCE_MS` of the last one (typing
//   the welcome, dragging the dimming) are one step: the newest replaces the present.
// - At most `HISTORY_LIMIT` steps back; a new change clears the redo side.
// - A step equal to the present (a value set back to what it was) records nothing.
// - Publishing and «Скинути зміни» start a new history.

export type Snapshot = { working: EditorWorking; images: ImageIds };

export type History = {
  past: readonly Snapshot[];
  present: Snapshot;
  future: readonly Snapshot[];
  /** The coalescing key of the last recorded change and when it was recorded. */
  lastKey: string | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 600;

export const sameSnapshot = (a: Snapshot, b: Snapshot) =>
  sameWorking(a.working, b.working) && sameImages(a.images, b.images);

export function initHistory(present: Snapshot): History {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/** Records `next` as the present; `key` coalesces rapid changes of one control. */
export function record(history: History, next: Snapshot, key: string | null, now: number): History {
  if (sameSnapshot(history.present, next)) return history;
  const coalesce =
    key !== null &&
    key === history.lastKey &&
    now - history.lastAt < COALESCE_MS &&
    history.future.length === 0;
  if (coalesce) return { ...history, present: next, lastAt: now };
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

/** One step back, or `null` when there is none. */
export function undo(history: History): History | null {
  const previous = history.past.at(-1);
  if (previous === undefined) return null;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

/** One step forward, or `null` when there is none. */
export function redo(history: History): History | null {
  const next = history.future[0];
  if (next === undefined) return null;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}

/**
 * Drops the steps whose image is gone (a restore answered `404`): every snapshot pointing at
 * `imageId` leaves the history, so undo never offers a step it cannot apply.
 */
export function dropImage(history: History, imageId: string): History {
  const keep = (snapshot: Snapshot) =>
    snapshot.images.cover !== imageId && snapshot.images.background !== imageId;
  return {
    ...history,
    past: history.past.filter(keep),
    future: history.future.filter(keep),
  };
}
