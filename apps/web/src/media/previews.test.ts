import { describe, expect, test } from 'vitest';
import { awaitsPreview, gridPicture, PREVIEW_WAIT_MS } from './previews';

const now = Date.parse('2026-10-04T12:00:00Z');
const at = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('awaitsPreview', () => {
  test('a recent pending frame waits; an old one, or a processed one, does not', () => {
    expect(awaitsPreview({ processingStatus: 'PENDING', createdAt: at(5_000) }, now)).toBe(true);
    expect(
      awaitsPreview({ processingStatus: 'PENDING', createdAt: at(PREVIEW_WAIT_MS + 1) }, now),
    ).toBe(false);
    for (const status of ['READY', 'FAILED', 'NOT_REQUIRED'] as const) {
      expect(awaitsPreview({ processingStatus: status, createdAt: at(5_000) }, now)).toBe(false);
    }
  });
});

describe('gridPicture', () => {
  test('the thumbnail when there is one, else failed or pending', () => {
    expect(gridPicture({ thumbnailUrl: 'https://s/t.webp', processingStatus: 'READY' })).toEqual({
      kind: 'thumbnail',
      url: 'https://s/t.webp',
    });
    expect(gridPicture({ thumbnailUrl: null, processingStatus: 'FAILED' })).toEqual({
      kind: 'failed',
    });
    expect(gridPicture({ thumbnailUrl: null, processingStatus: 'PENDING' })).toEqual({
      kind: 'pending',
    });
  });
});
