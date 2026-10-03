import type {
  CreateUploadRequest,
  GuestContentItem,
  UploadPartsResponse,
  UploadSessionResponse,
} from '@stepler/contracts';
import { isApiError } from '@/api/client';

// Browser → storage transfer of one file (spec §10.2, ADR 0008; spike S9 chose this in-house
// transport over Uppy: Uppy 6 completes multipart uploads from the browser, and the server must
// be the only party that does). A single presigned PUT, or multipart with at most 3 parts in
// flight, part URLs requested on demand in batches of at most 20. Every PUT goes through
// XMLHttpRequest for upload progress. Each PUT retries on its own with a backoff of 31 s in all:
// a broken path does not flip `navigator.onLine`, and spike S9 needed four retries to ride out
// a 10 s outage. The server verifies and completes; this file never trusts an ETag.

/** The subset of `XMLHttpRequest` the transport uses, so tests can drive it. */
export interface XhrLike {
  open(method: 'PUT', url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
  readonly status: number;
  readonly upload: { onprogress: ((event: { loaded: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
}

/** The upload calls for one collection, already wrapped in the guest session. */
export interface UploadApi {
  initiate(body: CreateUploadRequest): Promise<UploadSessionResponse>;
  parts(uploadId: string, partNumbers: number[], signal: AbortSignal): Promise<UploadPartsResponse>;
  complete(uploadId: string, signal: AbortSignal): Promise<GuestContentItem>;
  cancel(uploadId: string): Promise<void>;
}

/** Storage could not be reached (`NETWORK`) or refused the request (`STORAGE_403`). */
export class TransferError extends Error {
  constructor(readonly code: 'NETWORK' | 'STORAGE_403') {
    super(code);
    this.name = 'TransferError';
  }
}

export interface TransportOptions {
  createXhr?: () => XhrLike;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Resolves when the browser is online; waiting there costs no retry. */
  waitOnline?: (signal: AbortSignal) => Promise<void>;
  partConcurrency?: number;
  partUrlBatch?: number;
  /** Waits before retry 1, 2, … of one PUT; its length is the number of retries. */
  retryDelaysMs?: readonly number[];
}

export interface UploadEvents {
  /** The server's id for this upload, as soon as it exists (the hook cancels by it). */
  onInitiated?: (uploadId: string) => void;
  /** Every byte is in storage; completion follows. */
  onTransferred?: () => void;
}

export interface UploadTransport {
  /**
   * Sends one file and returns the recorded frame. `onProgress` gets bytes sent and never goes
   * back. Aborting `signal` stops every request at once and cancels the upload on the server.
   * Throws `TransferError`, `ApiError` (from the API calls) or the abort reason.
   */
  upload(
    item: { file: File; clientUploadId: string },
    api: UploadApi,
    signal: AbortSignal,
    onProgress: (loaded: number) => void,
    events?: UploadEvents,
  ): Promise<GuestContentItem>;
}

/** 1 + 2 + 4 + 8 + 16 = 31 s of backoff per PUT. */
export const PART_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const defaultWaitOnline = (signal: AbortSignal): Promise<void> =>
  typeof navigator === 'undefined' || navigator.onLine !== false
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        const onOnline = () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          window.removeEventListener('online', onOnline);
          reject(abortReason(signal));
        };
        window.addEventListener('online', onOnline, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });
      });

/** A PUT failure: 0 is no answer; a status is storage's answer. */
class PutFailed extends Error {
  constructor(readonly status: number) {
    super(`PUT ${status}`);
  }
}

const toTransferError = (error: PutFailed): TransferError =>
  new TransferError(error.status === 0 || error.status >= 500 ? 'NETWORK' : 'STORAGE_403');

/** One PUT with upload progress, aborted with `signal`. */
function put(
  createXhr: () => XhrLike,
  url: string,
  body: Blob,
  headers: Record<string, string>,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const xhr = createXhr();
    const onAbort = () => xhr.abort();
    const settle = (fn: () => void) => {
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      settle(() =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new PutFailed(xhr.status)),
      );
    xhr.onerror = () => settle(() => reject(new PutFailed(0)));
    xhr.ontimeout = () => settle(() => reject(new PutFailed(0)));
    xhr.onabort = () => settle(() => reject(abortReason(signal)));
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });
}

export function createUploadTransport(options: TransportOptions = {}): UploadTransport {
  const createXhr = options.createXhr ?? (() => new XMLHttpRequest() as XhrLike);
  const sleep = options.sleep ?? defaultSleep;
  const waitOnline = options.waitOnline ?? defaultWaitOnline;
  const partConcurrency = options.partConcurrency ?? 3;
  const partUrlBatch = options.partUrlBatch ?? 20;
  const delays = options.retryDelaysMs ?? PART_RETRY_DELAYS_MS;

  /**
   * Runs one PUT until it succeeds, retrying no answer, 5xx, 429 and 403 (after `onForbidden`
   * gets a fresh URL) with the backoff. Waiting for the network costs no retry.
   */
  async function withRetry(
    signal: AbortSignal,
    attempt: () => Promise<void>,
    onRetry: (error: PutFailed) => Promise<void> | void,
  ): Promise<void> {
    for (let retry = 0; ; retry += 1) {
      await waitOnline(signal);
      try {
        return await attempt();
      } catch (error) {
        if (signal.aborted || !(error instanceof PutFailed)) throw error;
        const retryable =
          error.status === 0 || error.status >= 500 || error.status === 429 || error.status === 403;
        const delay = delays[retry];
        if (!retryable || delay === undefined) throw toTransferError(error);
        await onRetry(error);
        await sleep(delay, signal);
      }
    }
  }

  return {
    async upload(item, api, signal, onProgress, events = {}) {
      const { file } = item;
      const request: CreateUploadRequest = {
        clientUploadId: item.clientUploadId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
      // Not aborted mid-call: an aborted initiation may still create the session, and only its
      // id lets us cancel it (and free its quota reservation) instead of waiting for expiry.
      let session = await api.initiate(request);
      events.onInitiated?.(session.uploadId);

      let reported = 0;
      const loaded = new Map<number, number>();
      const report = () => {
        let sum = 0;
        for (const bytes of loaded.values()) sum += bytes;
        // A part that restarts drops its bytes; the total shown never goes back.
        if (sum > reported) {
          reported = Math.min(sum, file.size);
          onProgress(reported);
        }
      };

      try {
        signal.throwIfAborted();
        if (session.strategy === 'SINGLE') {
          await withRetry(
            signal,
            () => {
              if (session.strategy !== 'SINGLE') throw new Error('Strategy changed');
              return put(createXhr, session.url, file, session.headers, signal, (bytes) => {
                loaded.set(0, bytes);
                report();
              });
            },
            async (error) => {
              loaded.set(0, 0);
              // An expired URL: the same `clientUploadId` returns the same session, freshly signed.
              if (error.status === 403) session = await api.initiate(request);
            },
          );
        } else {
          await sendParts(session, null);
        }
        events.onTransferred?.();

        try {
          return await api.complete(session.uploadId, signal);
        } catch (error) {
          // Once: storage lost some parts; send what the server lists, then complete again.
          const missing = missingParts(error);
          if (missing === null || session.strategy !== 'MULTIPART') throw error;
          await sendParts(session, missing);
          return await api.complete(session.uploadId, signal);
        }
      } catch (error) {
        if (signal.aborted) {
          await api.cancel(session.uploadId).catch(() => undefined);
          throw abortReason(signal);
        }
        throw error;
      }

      async function sendParts(
        multipart: Extract<UploadSessionResponse, { strategy: 'MULTIPART' }>,
        only: readonly number[] | null,
      ): Promise<void> {
        const { uploadId, partSizeBytes: size, partCount } = multipart;
        const todo = only === null ? Array.from({ length: partCount }, (_, i) => i + 1) : [...only];
        const urls = new Map<number, string>();
        let pending: Promise<void> | null = null;

        // A part that fails for good stops its siblings at once; the outer signal stops all.
        const local = new AbortController();
        const stopAll = () => local.abort(abortReason(signal));
        signal.addEventListener('abort', stopAll, { once: true });

        const parts = [...todo];
        const urlFor = async (part: number): Promise<string> => {
          for (let asked = 0; ;) {
            const url = urls.get(part);
            if (url !== undefined) return url;
            if (pending === null) {
              // Our own call failed to sign this part twice: something is wrong on the server.
              if (asked === 2) throw new TransferError('NETWORK');
              asked += 1;
              // This part and the next ones still without a URL, in one call; callers that
              // arrive while it runs wait for it instead of asking again.
              const batch = [part, ...parts.filter((p) => p !== part && !urls.has(p))];
              pending = api
                .parts(uploadId, batch.slice(0, partUrlBatch), local.signal)
                .then((response) => {
                  for (const p of response.parts) urls.set(p.partNumber, p.url);
                })
                .finally(() => {
                  pending = null;
                });
            }
            await pending;
          }
        };

        const sendPart = async (part: number) => {
          const blob = file.slice((part - 1) * size, Math.min(part * size, file.size));
          await withRetry(
            local.signal,
            async () => {
              await put(createXhr, await urlFor(part), blob, {}, local.signal, (bytes) => {
                loaded.set(part, bytes);
                report();
              });
              loaded.set(part, blob.size);
              report();
            },
            (error) => {
              loaded.set(part, 0);
              if (error.status === 403) urls.delete(part); // an expired part URL: sign it again
            },
          );
        };

        const worker = async () => {
          try {
            for (let part = todo.shift(); part !== undefined; part = todo.shift()) {
              await sendPart(part);
            }
          } catch (error) {
            if (!local.signal.aborted) local.abort(error);
            throw error;
          }
        };
        try {
          await Promise.all(
            Array.from({ length: Math.min(partConcurrency, todo.length) }, () => worker()),
          );
        } finally {
          signal.removeEventListener('abort', stopAll);
        }
      }
    },
  };
}

function missingParts(error: unknown): number[] | null {
  if (!isApiError(error, 'UPLOAD_INCOMPLETE')) return null;
  const missing = error.problem?.missingPartNumbers;
  return Array.isArray(missing) && missing.every((n) => Number.isInteger(n) && n >= 1)
    ? (missing as number[])
    : null;
}
