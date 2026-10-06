import type { AdminImage } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { imageState } from './image-state';

const cover = (status: 'PENDING' | 'READY' | 'FAILED'): AdminImage => ({
  id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
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
    expect(imageState(value, upload)).toBe(expected);
  });
});
