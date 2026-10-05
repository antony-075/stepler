import type { Collection } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { coverState } from './cover-state';

const cover = (status: 'PENDING' | 'READY' | 'FAILED'): Collection['cover'] => ({
  status,
  thumbnailUrl: status === 'READY' ? 'https://s3.test/t' : null,
  previewUrl: status === 'READY' ? 'https://s3.test/p' : null,
  largeUrl: null,
  width: status === 'READY' ? 1600 : null,
  height: status === 'READY' ? 1200 : null,
});

describe('coverState', () => {
  test.each([
    [null, { kind: 'idle' }, 'none'],
    [cover('PENDING'), { kind: 'idle' }, 'processing'],
    [cover('FAILED'), { kind: 'idle' }, 'failed'],
    [cover('READY'), { kind: 'idle' }, 'ready'],
    [cover('READY'), { kind: 'uploading', progress: 40 }, 'uploading'],
    [null, { kind: 'failed', code: 'NETWORK', retryable: true }, 'failed-upload'],
  ] as const)('%o + %o → %s', (value, upload, expected) => {
    expect(coverState(value, upload)).toBe(expected);
  });
});
