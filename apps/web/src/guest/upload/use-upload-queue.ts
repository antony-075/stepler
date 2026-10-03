'use client';

import type { GuestContext } from '@stepler/contracts';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type GuestUploadApi, guestUploadApi } from '../api';
import { precheck, type PrecheckResult } from './file-rules';
import {
  classifyFailure,
  hasUnsettled,
  initialQueueState,
  nextRetryAt,
  queueReducer,
  type QueueState,
  selectNext,
  summarize,
} from './queue';
import { createUploadTransport, type UploadApi, type UploadTransport } from './transport';

// Wires the queue reducer to the transport for the guest page (spec §10.5, DESIGN-SYSTEM.md
// §5.11): three files at a time, initiated just in time; automatic retries on timers; offline
// keeps files queued; a closed link blocks the rest; a full collection fails the rest; leaving
// the page while files are on their way asks first (`beforeunload`). The queue lives only on
// `/g/[token]`, so it is `useReducer` state, not a global store.

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

/** Concurrent file transfers (spec §10.2). */
const CONCURRENCY = 3;
/** Progress updates per file at most this often (DESIGN-SYSTEM.md §8: ≤ 4 a second). */
const PROGRESS_INTERVAL_MS = 250;

const defaultTransport = createUploadTransport();

/** The upload calls bound to one collection and run through the guest session's `call`. */
export function bindUploadApi(call: Call, api: GuestUploadApi = guestUploadApi): UploadApi {
  return {
    initiate: (body) => call((cid) => api.initiateUpload(cid, body)),
    parts: (uploadId, partNumbers, signal) =>
      call((cid) => api.presignParts(cid, uploadId, partNumbers, signal)),
    complete: (uploadId, signal) => call((cid) => api.completeUpload(cid, uploadId, signal)),
    cancel: (uploadId) => call((cid) => api.cancelUpload(cid, uploadId)),
  };
}

export interface UploadQueue {
  state: QueueState;
  summary: ReturnType<typeof summarize>;
  /** Pre-checks and queues picked files; the result says what was refused or left out. */
  add: (files: readonly File[]) => PrecheckResult;
  /** «Повторити» on one file, or every failed file. */
  retry: (localId?: string) => void;
  /** One file's cancel, or «Скасувати решту». */
  cancel: (localId?: string) => void;
  /** «Повторити зараз» on the offline notice: try at once instead of waiting for the event. */
  retryNow: () => void;
}

export function useUploadQueue(
  context: GuestContext,
  call: Call,
  transport: UploadTransport = defaultTransport,
): UploadQueue {
  const [state, dispatch] = useReducer(queueReducer, initialQueueState);
  const controllers = useRef(new Map<string, AbortController>());
  const [wake, setWake] = useState(0);
  const api = useMemo(() => bindUploadApi(call), [call]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const start = useCallback(
    (localId: string, current: QueueState) => {
      const item = current.items.find((i) => i.localId === localId);
      // Strict Mode runs effects twice; a file already in flight is not started again.
      if (item === undefined || controllers.current.has(localId)) return;
      const controller = new AbortController();
      controllers.current.set(localId, controller);
      const clientUploadId = item.needsNewSession ? crypto.randomUUID() : item.clientUploadId;
      dispatch({ type: 'started', localId, clientUploadId });

      const size = item.file.size;
      let lastTick = 0;
      transport
        .upload(
          { file: item.file, clientUploadId },
          api,
          controller.signal,
          (loaded) => {
            const now = Date.now();
            if (loaded < size && now - lastTick < PROGRESS_INTERVAL_MS) return;
            lastTick = now;
            dispatch({ type: 'progressed', localId, progress: (loaded / size) * 100 });
          },
          {
            onInitiated: (uploadId) => dispatch({ type: 'initiated', localId, uploadId }),
            onTransferred: () => dispatch({ type: 'transferred', localId }),
          },
        )
        .then((result) => dispatch({ type: 'completed', localId, result }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return; // cancelled: the reducer already knows
          const outcome = classifyFailure(error);
          if (outcome.kind === 'quota') dispatch({ type: 'quotaExceeded' });
          else if (outcome.kind === 'linkClosed') {
            dispatch({ type: 'linkClosed', state: outcome.state });
            // Bytes still on their way would only be discarded. A file already completing is
            // left alone: the server may have recorded it just before the link closed.
            for (const other of stateRef.current.items) {
              if (other.state === 'uploading') controllers.current.get(other.localId)?.abort();
            }
          } else {
            dispatch({
              type: 'failed',
              localId,
              error: outcome.error,
              retryable: outcome.retryable,
              now: Date.now(),
            });
          }
        })
        .finally(() => controllers.current.delete(localId));
    },
    [api, transport],
  );

  // Start what fits; wake up again when the earliest re-queued file may go.
  useEffect(() => {
    const now = Date.now();
    for (const localId of selectNext(state, CONCURRENCY, now)) start(localId, state);
    const at = nextRetryAt(state);
    if (at === null || at <= now) return;
    const timer = setTimeout(() => setWake((n) => n + 1), at - now);
    return () => clearTimeout(timer);
  }, [state, wake, start]);

  // A real outage may not flip `navigator.onLine` (spike S9); the transport retries those. When
  // it does flip, nothing new starts and failures do not count.
  useEffect(() => {
    const offline = () => dispatch({ type: 'offline' });
    const online = () => dispatch({ type: 'online' });
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  const busy = hasUnsettled(state);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ''; // Safari and older browsers ask only with this set
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  // Leaving the page stops every transfer and gives its session back.
  useEffect(() => {
    const inFlight = controllers.current;
    return () => {
      for (const controller of inFlight.values()) controller.abort();
    };
  }, []);

  const add = useCallback(
    (files: readonly File[]) => {
      const checked = precheck(files, context);
      dispatch({ type: 'rejected', rejected: checked.rejected, truncated: checked.truncated });
      if (checked.accepted.length > 0) {
        dispatch({
          type: 'added',
          items: checked.accepted.map(({ file, kind }) => ({
            localId: crypto.randomUUID(),
            clientUploadId: crypto.randomUUID(),
            file,
            kind,
          })),
        });
      }
      return checked;
    },
    [context],
  );

  const retry = useCallback((localId?: string) => {
    dispatch({ type: 'retryRequested', localId });
  }, []);

  const cancel = useCallback(
    (localId?: string) => {
      for (const item of stateRef.current.items) {
        if (localId !== undefined && item.localId !== localId) continue;
        const controller = controllers.current.get(item.localId);
        // In flight: the transport aborts its requests and cancels on the server. Waiting for a
        // retry with a session open: cancel that session here.
        if (controller !== undefined) controller.abort();
        else if (
          (item.state === 'queued' || item.state === 'failed') &&
          item.uploadId !== undefined &&
          !item.needsNewSession
        ) {
          void api.cancel(item.uploadId).catch(() => undefined);
        }
      }
      dispatch({ type: 'cancelled', localId });
    },
    [api],
  );

  const retryNow = useCallback(() => {
    dispatch({ type: 'online' });
    setWake((n) => n + 1);
  }, []);

  const summary = useMemo(() => summarize(state), [state]);
  return { state, summary, add, retry, cancel, retryNow };
}
