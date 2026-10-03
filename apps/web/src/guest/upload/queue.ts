import type { ErrorCode, FileKind, GuestContentItem } from '@stepler/contracts';
import { isApiError } from '@/api/client';
import { type GuestPageState, guestPageState, isPageEndingError } from '../guest-state';
import type { RejectReason } from './file-rules';
import { TransferError } from './transport';

// The guest's upload queue as a pure reducer (DESIGN-SYSTEM.md §5.11, spec §10.5). The hook
// (`use-upload-queue.ts`) runs the transfers and turns their outcomes into actions; everything
// the screen shows is derived from this state. Two retry levels: the transport retries each
// part or PUT on its own (about 30 s of backoff); a file that still fails comes back here and is
// re-queued after `retryDelayMs`, three times, then waits for «Повторити».

/** A transport-level failure: no answer at all, or storage refused the presigned URL. */
export type UploadErrorCode = ErrorCode | 'NETWORK' | 'STORAGE_403';

export type UploadItemState =
  'queued' | 'uploading' | 'processing' | 'done' | 'failed' | 'cancelled' | 'blocked';

export interface UploadItem {
  localId: string;
  file: File;
  kind: FileKind;
  /** One per file, kept across retries: initiation is idempotent on it. */
  clientUploadId: string;
  state: UploadItemState;
  /** 0–100; never goes back while the file is uploading. */
  progress: number;
  /** Failed transfers so far (automatic and manual retries both count). */
  attempts: number;
  /** Not before this time (ms since epoch) when re-queued after a failure. */
  retryAt?: number;
  uploadId?: string;
  /**
   * The last failure closed the server's session (rejected, expired) or never opened one: the
   * next start uses a new `clientUploadId`. Automatic retries keep the old one.
   */
  needsNewSession?: boolean;
  error?: UploadErrorCode;
  result?: GuestContentItem;
}

export interface QueueState {
  items: UploadItem[];
  /** Files refused by the pre-check, for the summary line; replaced by each new pick. */
  rejected: { name: string; reason: RejectReason }[];
  /** Acceptable files left out of the last pick by the batch limit. */
  truncated: number;
  offline: boolean;
  /** The link or collection stopped accepting files; nothing else starts. */
  linkClosed: GuestPageState | null;
}

export type QueueAction =
  | {
      type: 'added';
      items: Pick<UploadItem, 'localId' | 'file' | 'kind' | 'clientUploadId'>[];
    }
  | { type: 'rejected'; rejected: QueueState['rejected']; truncated: number }
  /** `clientUploadId` replaces the old one when the item `needsNewSession`. */
  | { type: 'started'; localId: string; clientUploadId?: string }
  | { type: 'initiated'; localId: string; uploadId: string }
  | { type: 'progressed'; localId: string; progress: number }
  | { type: 'transferred'; localId: string }
  | { type: 'completed'; localId: string; result: GuestContentItem }
  | {
      type: 'failed';
      localId: string;
      error: UploadErrorCode;
      retryable: boolean;
      /** The time of the failure, for `retryAt` (keeps the reducer pure). */
      now: number;
    }
  /** «Повторити» on one frame, or «Повторити невдалі» without `localId`. */
  | { type: 'retryRequested'; localId?: string }
  /** One frame's cancel, or «Скасувати решту» without `localId`. */
  | { type: 'cancelled'; localId?: string }
  | { type: 'offline' }
  | { type: 'online' }
  | { type: 'linkClosed'; state: GuestPageState }
  /** The collection is full: everything not yet done fails with `QUOTA_EXCEEDED`. */
  | { type: 'quotaExceeded' };

export const initialQueueState: QueueState = {
  items: [],
  rejected: [],
  truncated: 0,
  offline: false,
  linkClosed: null,
};

const RETRY_DELAYS_MS = [2_000, 8_000, 30_000] as const;

/** The wait before automatic retry `attempt` (1-based), or `null`: the guest retries by hand. */
export function retryDelayMs(attempt: number): number | null {
  return RETRY_DELAYS_MS[attempt - 1] ?? null;
}

const RETRYABLE = new Set<UploadErrorCode>([
  'NETWORK',
  'STORAGE_403',
  'UPSTREAM_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'RATE_LIMITED',
  'UPLOAD_INCOMPLETE',
]);

/**
 * Worth another automatic try: the network, storage (an expired URL: re-initiation signs a fresh
 * one), the API's dependencies or rate limit, missing parts. File, size, quota, permission and
 * link or collection state errors are final.
 */
export function isRetryable(code: UploadErrorCode): boolean {
  return RETRYABLE.has(code);
}

const isUnsettled = (item: UploadItem): boolean =>
  item.state === 'queued' || item.state === 'uploading' || item.state === 'processing';

const update = (
  state: QueueState,
  localId: string | undefined,
  change: (item: UploadItem) => UploadItem,
): QueueState => ({
  ...state,
  items: state.items.map((item) =>
    localId === undefined || item.localId === localId ? change(item) : item,
  ),
});

function failed(
  item: UploadItem,
  action: Extract<QueueAction, { type: 'failed' }>,
  offline: boolean,
): UploadItem {
  if (!isUnsettled(item)) return item;
  // Offline is not the file's fault: it waits in the queue without spending an attempt.
  if (offline && action.error === 'NETWORK') {
    return { ...item, state: 'queued', progress: 0, retryAt: undefined };
  }
  const attempts = item.attempts + 1;
  const delay = action.retryable ? retryDelayMs(attempts) : null;
  return delay === null
    ? {
        ...item,
        state: 'failed',
        attempts,
        error: action.error,
        retryAt: undefined,
        needsNewSession: !action.retryable,
      }
    : {
        ...item,
        state: 'queued',
        attempts,
        progress: 0,
        error: action.error,
        retryAt: action.now + delay,
      };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'added':
      return {
        ...state,
        items: [
          ...state.items,
          ...action.items.map((item): UploadItem => ({
            ...item,
            state: 'queued',
            progress: 0,
            attempts: 0,
          })),
        ],
      };
    case 'rejected':
      return { ...state, rejected: action.rejected, truncated: action.truncated };
    case 'started':
      return update(state, action.localId, (item) =>
        item.state === 'queued'
          ? {
              ...item,
              state: 'uploading',
              progress: 0,
              retryAt: undefined,
              clientUploadId: action.clientUploadId ?? item.clientUploadId,
              uploadId: action.clientUploadId === undefined ? item.uploadId : undefined,
              needsNewSession: false,
            }
          : item,
      );
    case 'initiated':
      return update(state, action.localId, (item) => ({ ...item, uploadId: action.uploadId }));
    case 'progressed':
      return update(state, action.localId, (item) =>
        item.state === 'uploading'
          ? { ...item, progress: Math.min(100, Math.max(item.progress, action.progress)) }
          : item,
      );
    case 'transferred':
      return update(state, action.localId, (item) =>
        item.state === 'uploading' ? { ...item, state: 'processing', progress: 100 } : item,
      );
    case 'completed':
      // The server recorded the frame, whatever happened here meanwhile (a late cancel, the link
      // closing): it is in the collection, so it shows as added.
      return update(state, action.localId, (item) => ({
        ...item,
        state: 'done',
        progress: 100,
        error: undefined,
        result: action.result,
      }));
    case 'failed':
      return update(state, action.localId, (item) => failed(item, action, state.offline));
    case 'retryRequested':
      if (state.linkClosed !== null) return state;
      return update(state, action.localId, (item) =>
        item.state === 'failed'
          ? {
              ...item,
              state: 'queued',
              progress: 0,
              attempts: 0,
              error: undefined,
              retryAt: undefined,
            }
          : item,
      );
    case 'cancelled':
      return update(state, action.localId, (item) =>
        isUnsettled(item) || item.state === 'failed' ? { ...item, state: 'cancelled' } : item,
      );
    case 'offline':
      return { ...state, offline: true };
    case 'online':
      return { ...state, offline: false };
    case 'linkClosed':
      return {
        ...state,
        linkClosed: action.state,
        items: state.items.map((item) =>
          item.state === 'done' || item.state === 'cancelled'
            ? item
            : { ...item, state: 'blocked' },
        ),
      };
    case 'quotaExceeded':
      return {
        ...state,
        items: state.items.map((item) =>
          isUnsettled(item) ? { ...item, state: 'failed', error: 'QUOTA_EXCEEDED' } : item,
        ),
      };
  }
}

/**
 * The queued files to start now, oldest first, so that at most `concurrency` transfer at once.
 * None while offline or after the link closed; a re-queued file waits for its `retryAt`.
 */
export function selectNext(state: QueueState, concurrency = 3, now = Date.now()): string[] {
  if (state.offline || state.linkClosed !== null) return [];
  const active = state.items.filter(
    (item) => item.state === 'uploading' || item.state === 'processing',
  ).length;
  const free = concurrency - active;
  if (free <= 0) return [];
  return state.items
    .filter((item) => item.state === 'queued' && (item.retryAt ?? 0) <= now)
    .slice(0, free)
    .map((item) => item.localId);
}

/** The earliest pending `retryAt`, so the hook knows when to look again. */
export function nextRetryAt(state: QueueState): number | null {
  const times = state.items
    .filter((item) => item.state === 'queued' && item.retryAt !== undefined)
    .map((item) => item.retryAt as number);
  return times.length === 0 ? null : Math.min(...times);
}

/** Something is still on its way: keep the page open (`beforeunload`). */
export function hasUnsettled(state: QueueState): boolean {
  return state.items.some(isUnsettled);
}

/** The counts and bytes `UploadSummary` shows; cancelled files are counted, not shown. */
export function summarize(state: QueueState) {
  let added = 0;
  let failedCount = 0;
  let cancelled = 0;
  let bytesTotal = 0;
  let bytesDone = 0;
  for (const item of state.items) {
    if (item.state === 'cancelled') {
      cancelled += 1;
      continue;
    }
    if (item.state === 'done') added += 1;
    if (item.state === 'failed') failedCount += 1;
    bytesTotal += item.file.size;
    bytesDone += Math.round((item.file.size * item.progress) / 100);
  }
  return {
    added,
    failed: failedCount,
    cancelled,
    total: state.items.length,
    bytesDone,
    bytesTotal,
  };
}

/** What one failed transfer means for the queue. */
export type FailureOutcome =
  | { kind: 'quota' }
  | { kind: 'linkClosed'; state: GuestPageState }
  | { kind: 'failed'; error: UploadErrorCode; retryable: boolean };

/**
 * Sorts a transport or API error: the collection is full (stop everything), the link or
 * collection changed (block everything), or this file failed, retryably or not.
 */
export function classifyFailure(error: unknown): FailureOutcome {
  if (isApiError(error, 'QUOTA_EXCEEDED')) return { kind: 'quota' };
  if (isPageEndingError(error)) return { kind: 'linkClosed', state: guestPageState(error) };
  const code: UploadErrorCode =
    error instanceof TransferError ? error.code : isApiError(error) ? error.code : 'INTERNAL';
  return { kind: 'failed', error: code, retryable: isRetryable(code) };
}
