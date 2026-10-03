import type { GuestContentItem, UploadSessionResponse } from '@stepler/contracts';
import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { createUploadTransport, TransferError, type UploadApi, type XhrLike } from './transport';

const UPLOAD_ID = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const result = { id: UPLOAD_ID } as GuestContentItem;
const expiresAt = '2026-10-03T12:00:00.000Z';

type Behaviour = 'ok' | 'hang' | number;

/** A fake XHR: `behave(url, attempt)` picks the outcome; `ok` reports progress first. */
class FakeXhr implements XhrLike {
  static all: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  status = 0;
  aborted = false;
  upload: XhrLike['upload'] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(private readonly behave: (url: string) => Behaviour) {
    FakeXhr.all.push(this);
  }
  open(method: 'PUT', url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    this.body = body;
    const outcome = this.behave(this.url);
    if (outcome === 'hang') return;
    setTimeout(() => {
      if (this.aborted) return;
      if (outcome === 'ok') {
        this.upload.onprogress?.({ loaded: Math.floor(body.size / 2) });
        this.upload.onprogress?.({ loaded: body.size });
        this.status = 200;
        this.onload?.();
      } else if (outcome === 0) {
        this.onerror?.();
      } else {
        this.status = outcome;
        this.onload?.();
      }
    }, 0);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

function setup(options: {
  size: number;
  session: UploadSessionResponse;
  behave?: (url: string) => Behaviour;
}) {
  FakeXhr.all = [];
  const behave = options.behave ?? (() => 'ok');
  const sleeps: number[] = [];
  const api = {
    initiate: vi.fn<UploadApi['initiate']>(() => Promise.resolve(options.session)),
    parts: vi.fn<UploadApi['parts']>((_id, partNumbers) =>
      Promise.resolve({
        parts: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://s3.test/part/${partNumber}?v=${Math.random()}`,
        })),
        expiresAt,
      }),
    ),
    complete: vi.fn<UploadApi['complete']>(() => Promise.resolve(result)),
    cancel: vi.fn<UploadApi['cancel']>(() => Promise.resolve()),
  };
  const transport = createUploadTransport({
    createXhr: () => new FakeXhr(behave),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    waitOnline: () => Promise.resolve(),
  });
  const file = new File([new Uint8Array(options.size)], 'clip.mp4', { type: 'video/mp4' });
  const progress: number[] = [];
  const item = { file, clientUploadId: 'c1' };
  return {
    api,
    transport,
    file,
    item,
    progress,
    sleeps,
    onProgress: (n: number) => progress.push(n),
  };
}

const single: UploadSessionResponse = {
  uploadId: UPLOAD_ID,
  strategy: 'SINGLE',
  url: 'https://s3.test/single',
  headers: { 'content-type': 'video/mp4' },
  expiresAt,
};
const multipart = (partSizeBytes: number, partCount: number): UploadSessionResponse => ({
  uploadId: UPLOAD_ID,
  strategy: 'MULTIPART',
  partSizeBytes,
  partCount,
  expiresAt,
});

const partOf = (url: string) => Number(/part\/(\d+)/.exec(url)?.[1]);
const nonDecreasing = (values: number[]) => values.every((v, i) => i === 0 || v >= values[i - 1]!);

describe('UploadTransport', () => {
  test('single PUT with the signed content-type, then complete', async () => {
    const t = setup({ size: 20, session: single });
    const events = { onInitiated: vi.fn(), onTransferred: vi.fn() };
    const done = await t.transport.upload(
      t.item,
      t.api,
      new AbortController().signal,
      t.onProgress,
      events,
    );
    expect(done).toBe(result);
    expect(t.api.initiate).toHaveBeenCalledWith({
      clientUploadId: 'c1',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 20,
    });
    expect(FakeXhr.all).toHaveLength(1);
    expect(FakeXhr.all[0]).toMatchObject({
      method: 'PUT',
      url: 'https://s3.test/single',
      headers: { 'content-type': 'video/mp4' },
    });
    expect(t.progress).toEqual([10, 20]);
    expect(events.onInitiated).toHaveBeenCalledWith(UPLOAD_ID);
    expect(events.onTransferred).toHaveBeenCalledOnce();
    expect(t.api.complete).toHaveBeenCalledOnce();
  });

  test('multipart: progress sums across parts, never more than three PUTs at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const t = setup({
      size: 45,
      session: multipart(10, 5),
      behave: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        setTimeout(() => (inFlight -= 1), 0);
        return 'ok';
      },
    });
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(FakeXhr.all.map((x) => x.body?.size).sort()).toEqual([10, 10, 10, 10, 5].sort());
    expect(t.progress.at(-1)).toBe(45);
    expect(nonDecreasing(t.progress)).toBe(true);
    // Part URLs on demand: the first call asks for part 1 and the rest still unsigned.
    expect(t.api.parts.mock.calls[0]?.[1]).toEqual([1, 2, 3, 4, 5]);
    expect(t.api.parts).toHaveBeenCalledOnce();
  });

  test('part URLs come in batches of at most 20', async () => {
    const t = setup({ size: 25, session: multipart(1, 25) });
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    for (const call of t.api.parts.mock.calls) expect(call[1].length).toBeLessThanOrEqual(20);
    const asked = t.api.parts.mock.calls.flatMap((call) => call[1]);
    expect(new Set(asked).size).toBe(25);
  });

  test('a part failing twice then succeeding: retried with backoff, progress never goes back', async () => {
    const attempts = new Map<number, number>();
    const t = setup({
      size: 30,
      session: multipart(10, 3),
      behave: (url) => {
        const part = partOf(url);
        const n = (attempts.get(part) ?? 0) + 1;
        attempts.set(part, n);
        return part === 2 && n <= 2 ? 0 : 'ok';
      },
    });
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    expect(attempts.get(2)).toBe(3);
    expect(t.sleeps).toEqual([1_000, 2_000]);
    expect(t.progress.at(-1)).toBe(30);
    expect(nonDecreasing(t.progress)).toBe(true);
    expect(t.api.complete).toHaveBeenCalledOnce();
  });

  test('the backoff per PUT adds up to more than 30 s, then the file fails with NETWORK', async () => {
    const t = setup({ size: 10, session: single, behave: () => 503 });
    const error = await t.transport
      .upload(t.item, t.api, new AbortController().signal, t.onProgress)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransferError);
    expect(error).toMatchObject({ code: 'NETWORK' });
    expect(t.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThan(30_000);
    expect(FakeXhr.all).toHaveLength(t.sleeps.length + 1);
    expect(t.api.complete).not.toHaveBeenCalled();
    expect(t.api.cancel).not.toHaveBeenCalled();
  });

  test('a 403 on a single PUT re-initiates for a fresh URL', async () => {
    let first = true;
    const t = setup({
      size: 10,
      session: single,
      behave: () => {
        if (!first) return 'ok';
        first = false;
        return 403;
      },
    });
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    expect(t.api.initiate).toHaveBeenCalledTimes(2);
    expect(t.api.initiate.mock.calls[1]?.[0].clientUploadId).toBe('c1');
  });

  test('a 403 on a part signs that part again', async () => {
    let failed = false;
    const t = setup({
      size: 20,
      session: multipart(10, 2),
      behave: (url) => {
        if (partOf(url) === 2 && !failed) {
          failed = true;
          return 403;
        }
        return 'ok';
      },
    });
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    expect(t.api.parts.mock.calls.map((call) => call[1])).toEqual([[1, 2], [2]]);
  });

  test('UPLOAD_INCOMPLETE: sends the missing parts once, then completes again', async () => {
    const t = setup({ size: 30, session: multipart(10, 3) });
    t.api.complete.mockRejectedValueOnce(
      new ApiError('UPLOAD_INCOMPLETE', 409, undefined, {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        code: 'UPLOAD_INCOMPLETE',
        retryable: true,
        missingPartNumbers: [3],
      }),
    );
    await t.transport.upload(t.item, t.api, new AbortController().signal, t.onProgress);
    expect(FakeXhr.all.map((x) => partOf(x.url))).toEqual([1, 2, 3, 3]);
    expect(t.api.complete).toHaveBeenCalledTimes(2);
  });

  test('a part that fails for good stops its siblings', async () => {
    const t = setup({
      size: 30,
      session: multipart(10, 3),
      behave: (url) => (partOf(url) === 1 ? 400 : 'hang'),
    });
    const error = await t.transport
      .upload(t.item, t.api, new AbortController().signal, t.onProgress)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'STORAGE_403' });
    expect(FakeXhr.all.filter((x) => partOf(x.url) !== 1).every((x) => x.aborted)).toBe(true);
  });

  test('abort stops every request, starts no new one and cancels on the server', async () => {
    const t = setup({ size: 50, session: multipart(10, 5), behave: () => 'hang' });
    const controller = new AbortController();
    const upload = t.transport
      .upload(t.item, t.api, controller.signal, t.onProgress)
      .catch((e: unknown) => e);
    await vi.waitFor(() => expect(FakeXhr.all).toHaveLength(3));
    controller.abort();
    const error = await upload;
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.all).toHaveLength(3);
    expect(FakeXhr.all.every((x) => x.aborted)).toBe(true);
    expect(t.api.cancel).toHaveBeenCalledExactlyOnceWith(UPLOAD_ID);
    expect(t.api.complete).not.toHaveBeenCalled();
  });

  test('an abort during initiation cancels the session once it exists', async () => {
    const t = setup({ size: 10, session: single });
    const controller = new AbortController();
    t.api.initiate.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(single);
    });
    const error = await t.transport
      .upload(t.item, t.api, controller.signal, t.onProgress)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.all).toHaveLength(0);
    expect(t.api.cancel).toHaveBeenCalledExactlyOnceWith(UPLOAD_ID);
  });
});
