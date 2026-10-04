import { describe, expect, test } from 'vitest';
import {
  awaitsPreview,
  GUEST_PREVIEW_WAIT_MS,
  gridPicture,
  guestPollDelay,
  PREVIEW_WAIT_MS,
} from './previews';

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

describe('guest polling', () => {
  test('waits 15–20 s between rounds and gives up on a frame after 10 minutes', () => {
    expect(guestPollDelay(() => 0)).toBe(15_000);
    expect(guestPollDelay(() => 1)).toBe(20_000);
    const old = { processingStatus: 'PENDING' as const, createdAt: at(GUEST_PREVIEW_WAIT_MS + 1) };
    expect(awaitsPreview(old, now, GUEST_PREVIEW_WAIT_MS)).toBe(false);
    expect(awaitsPreview(old, now)).toBe(true);
  });
});
