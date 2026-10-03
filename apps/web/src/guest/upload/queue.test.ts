import type { GuestContentItem } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { ApiError } from '@/api/client';
import {
  classifyFailure,
  hasUnsettled,
  initialQueueState,
  isRetryable,
  nextRetryAt,
  type QueueAction,
  queueReducer,
  type QueueState,
  retryDelayMs,
  selectNext,
  summarize,
} from './queue';
import { TransferError } from './transport';

const file = (name: string, size = 1000) => {
  const f = new File([], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

const result = { id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9' } as GuestContentItem;

const withFiles = (count: number): QueueState =>
  queueReducer(initialQueueState, {
    type: 'added',
    items: Array.from({ length: count }, (_, i) => ({
      localId: `f${i + 1}`,
      file: file(`IMG_${i + 1}.jpg`),
      kind: 'PHOTO' as const,
      clientUploadId: `c${i + 1}`,
    })),
  });

const run = (state: QueueState, ...actions: QueueAction[]) => actions.reduce(queueReducer, state);
const item = (state: QueueState, localId: string) =>
  state.items.find((i) => i.localId === localId)!;

const fail = (localId: string, retryable = true, now = 1_000): QueueAction => ({
  type: 'failed',
  localId,
  error: retryable ? 'NETWORK' : 'FILE_TYPE_NOT_ALLOWED',
  retryable,
  now,
});

describe('retryDelayMs', () => {
  test('2 s, 8 s, 30 s, then by hand', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([2_000, 8_000, 30_000, null]);
  });
});

describe('isRetryable', () => {
  test('network, storage and dependency errors retry; file, quota and link errors do not', () => {
    for (const code of [
      'NETWORK',
      'STORAGE_403',
      'UPSTREAM_UNAVAILABLE',
      'DEPENDENCY_UNAVAILABLE',
      'RATE_LIMITED',
      'UPLOAD_INCOMPLETE',
      'UPLOAD_IN_PROGRESS',
    ] as const) {
      expect(isRetryable(code), code).toBe(true);
    }
    for (const code of [
      'FILE_TYPE_NOT_ALLOWED',
      'FILE_TOO_LARGE',
      'UPLOAD_SIZE_MISMATCH',
      'QUOTA_EXCEEDED',
      'FORBIDDEN',
      'LINK_REVOKED',
      'LINK_INACTIVE',
      'COLLECTION_ARCHIVED',
      'COLLECTION_UNAVAILABLE',
      'UPLOAD_EXPIRED',
    ] as const) {
      expect(isRetryable(code), code).toBe(false);
    }
  });
});

describe('queueReducer', () => {
  test('queued → uploading → processing → done', () => {
    let state = withFiles(1);
    expect(item(state, 'f1')).toMatchObject({ state: 'queued', progress: 0, attempts: 0 });
    state = run(
      state,
      { type: 'started', localId: 'f1' },
      { type: 'initiated', localId: 'f1', uploadId: 'u1' },
    );
    expect(item(state, 'f1')).toMatchObject({ state: 'uploading', uploadId: 'u1' });
    state = run(state, { type: 'progressed', localId: 'f1', progress: 40 });
    expect(item(state, 'f1').progress).toBe(40);
    state = run(state, { type: 'transferred', localId: 'f1' });
    expect(item(state, 'f1')).toMatchObject({ state: 'processing', progress: 100 });
    state = run(state, { type: 'completed', localId: 'f1', result });
    expect(item(state, 'f1')).toMatchObject({ state: 'done', result });
  });

  test('progress never goes back while uploading', () => {
    const state = run(
      withFiles(1),
      { type: 'started', localId: 'f1' },
      { type: 'progressed', localId: 'f1', progress: 60 },
      { type: 'progressed', localId: 'f1', progress: 35 },
    );
    expect(item(state, 'f1').progress).toBe(60);
  });

  test('a retryable failure re-queues after retryDelayMs; the fourth failure stays failed', () => {
    let state = run(withFiles(1), { type: 'started', localId: 'f1' }, fail('f1', true, 1_000));
    expect(item(state, 'f1')).toMatchObject({
      state: 'queued',
      attempts: 1,
      retryAt: 3_000,
      error: 'NETWORK',
    });
    expect(selectNext(state, 3, 2_999)).toEqual([]);
    expect(selectNext(state, 3, 3_000)).toEqual(['f1']);
    expect(nextRetryAt(state)).toBe(3_000);

    state = run(state, { type: 'started', localId: 'f1' }, fail('f1', true, 10_000));
    expect(item(state, 'f1')).toMatchObject({ state: 'queued', attempts: 2, retryAt: 18_000 });
    state = run(state, { type: 'started', localId: 'f1' }, fail('f1', true, 20_000));
    expect(item(state, 'f1')).toMatchObject({ state: 'queued', attempts: 3, retryAt: 50_000 });
    state = run(state, { type: 'started', localId: 'f1' }, fail('f1', true, 60_000));
    expect(item(state, 'f1')).toMatchObject({ state: 'failed', attempts: 4 });
    expect(selectNext(state, 3, 1e12)).toEqual([]);
  });

  test('a non-retryable failure fails at once; «Повторити» queues it again', () => {
    let state = run(withFiles(1), { type: 'started', localId: 'f1' }, fail('f1', false));
    expect(item(state, 'f1')).toMatchObject({
      state: 'failed',
      attempts: 1,
      error: 'FILE_TYPE_NOT_ALLOWED',
    });
    state = run(state, { type: 'retryRequested', localId: 'f1' });
    expect(item(state, 'f1')).toMatchObject({ state: 'queued', attempts: 0, error: undefined });
  });

  test('«Повторити невдалі» re-queues every failed file and nothing else', () => {
    const state = run(
      withFiles(3),
      { type: 'started', localId: 'f1' },
      fail('f1', false),
      { type: 'started', localId: 'f2' },
      fail('f2', false),
      { type: 'started', localId: 'f3' },
      { type: 'retryRequested' },
    );
    expect(state.items.map((i) => i.state)).toEqual(['queued', 'queued', 'uploading']);
  });

  test('offline keeps files queued and starts nothing; a network failure then costs no attempt', () => {
    let state = run(withFiles(4), { type: 'started', localId: 'f1' }, { type: 'offline' });
    expect(selectNext(state)).toEqual([]);
    state = run(state, fail('f1'));
    expect(item(state, 'f1')).toMatchObject({ state: 'queued', attempts: 0 });
    expect(item(state, 'f2').state).toBe('queued');
    state = run(state, { type: 'online' });
    expect(selectNext(state)).toEqual(['f1', 'f2', 'f3']);
  });

  test('a cancelled file leaves selectNext; «Скасувати решту» keeps finished files', () => {
    let state = run(withFiles(3), { type: 'cancelled', localId: 'f1' });
    expect(item(state, 'f1').state).toBe('cancelled');
    expect(selectNext(state)).toEqual(['f2', 'f3']);
    state = run(
      state,
      { type: 'started', localId: 'f2' },
      { type: 'completed', localId: 'f2', result },
      { type: 'cancelled' },
    );
    expect(state.items.map((i) => i.state)).toEqual(['cancelled', 'done', 'cancelled']);
    expect(hasUnsettled(state)).toBe(false);
  });

  test('linkClosed blocks everything not done and starts nothing', () => {
    let state = run(
      withFiles(4),
      { type: 'started', localId: 'f1' },
      { type: 'completed', localId: 'f1', result },
      { type: 'started', localId: 'f2' },
      { type: 'linkClosed', state: 'revoked' },
    );
    expect(state.linkClosed).toBe('revoked');
    expect(state.items.map((i) => i.state)).toEqual(['done', 'blocked', 'blocked', 'blocked']);
    expect(selectNext(state)).toEqual([]);
    state = run(state, { type: 'retryRequested' });
    expect(item(state, 'f2').state).toBe('blocked');
  });

  test('a completion that lands after the link closed still counts as added', () => {
    const state = run(
      withFiles(1),
      { type: 'started', localId: 'f1' },
      { type: 'transferred', localId: 'f1' },
      { type: 'linkClosed', state: 'paused' },
      { type: 'completed', localId: 'f1', result },
    );
    expect(item(state, 'f1').state).toBe('done');
  });

  test('quotaExceeded fails every unsettled file with that reason', () => {
    const state = run(
      withFiles(3),
      { type: 'started', localId: 'f1' },
      { type: 'completed', localId: 'f1', result },
      { type: 'started', localId: 'f2' },
      { type: 'quotaExceeded' },
    );
    expect(state.items.map((i) => [i.state, i.error])).toEqual([
      ['done', undefined],
      ['failed', 'QUOTA_EXCEEDED'],
      ['failed', 'QUOTA_EXCEEDED'],
    ]);
  });

  test('a file whose session closed starts again with a new clientUploadId', () => {
    let state = run(withFiles(1), { type: 'started', localId: 'f1' }, fail('f1', false));
    expect(item(state, 'f1').needsNewSession).toBe(true);
    state = run(
      state,
      { type: 'retryRequested', localId: 'f1' },
      { type: 'started', localId: 'f1', clientUploadId: 'c-new' },
    );
    expect(item(state, 'f1')).toMatchObject({ clientUploadId: 'c-new', needsNewSession: false });
  });

  test('automatic retries keep the clientUploadId', () => {
    const state = run(withFiles(1), { type: 'started', localId: 'f1' }, fail('f1'));
    expect(item(state, 'f1')).toMatchObject({ clientUploadId: 'c1' });
    expect(item(state, 'f1').needsNewSession).toBeFalsy();
  });

  test('rejected keeps the last pick’s refused files and left-out count', () => {
    const state = run(initialQueueState, {
      type: 'rejected',
      rejected: [{ name: 'a.exe', reason: 'type' }],
      truncated: 20,
    });
    expect(state.rejected).toEqual([{ name: 'a.exe', reason: 'type' }]);
    expect(state.truncated).toBe(20);
  });
});

describe('selectNext', () => {
  test('never more than three in flight, oldest first', () => {
    let state = withFiles(6);
    const first = selectNext(state);
    expect(first).toEqual(['f1', 'f2', 'f3']);
    state = run(state, ...first.map((localId): QueueAction => ({ type: 'started', localId })));
    expect(selectNext(state)).toEqual([]);
    state = run(state, { type: 'transferred', localId: 'f1' });
    // Completion still holds its slot.
    expect(selectNext(state)).toEqual([]);
    state = run(state, { type: 'completed', localId: 'f1', result });
    expect(selectNext(state)).toEqual(['f4']);
  });
});

describe('summarize', () => {
  test('counts and bytes; cancelled files are counted apart', () => {
    const state = run(
      withFiles(4),
      { type: 'started', localId: 'f1' },
      { type: 'completed', localId: 'f1', result },
      { type: 'started', localId: 'f2' },
      { type: 'progressed', localId: 'f2', progress: 50 },
      { type: 'started', localId: 'f3' },
      fail('f3', false),
      { type: 'cancelled', localId: 'f4' },
    );
    expect(summarize(state)).toEqual({
      added: 1,
      failed: 1,
      cancelled: 1,
      total: 4,
      bytesDone: 1500,
      bytesTotal: 3000,
    });
  });
});

describe('classifyFailure', () => {
  test('quota, link state, retryable and final failures', () => {
    expect(classifyFailure(new ApiError('QUOTA_EXCEEDED', 409))).toEqual({ kind: 'quota' });
    expect(classifyFailure(new ApiError('LINK_REVOKED', 410))).toEqual({
      kind: 'linkClosed',
      state: 'revoked',
    });
    expect(classifyFailure(new ApiError('LINK_INACTIVE', 403))).toEqual({
      kind: 'linkClosed',
      state: 'paused',
    });
    expect(classifyFailure(new TransferError('NETWORK'))).toEqual({
      kind: 'failed',
      error: 'NETWORK',
      retryable: true,
    });
    expect(classifyFailure(new ApiError('FILE_TYPE_NOT_ALLOWED', 422))).toEqual({
      kind: 'failed',
      error: 'FILE_TYPE_NOT_ALLOWED',
      retryable: false,
    });
    expect(classifyFailure(new Error('bug'))).toEqual({
      kind: 'failed',
      error: 'INTERNAL',
      retryable: false,
    });
  });
});
