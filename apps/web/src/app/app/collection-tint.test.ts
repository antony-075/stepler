import { FRAME_TINTS } from '@stepler/ui/lib/frame-tints';
import { describe, expect, it } from 'vitest';
import { collectionTint } from './collection-tint';

describe('collectionTint', () => {
  it('gives the same collection the same tint every time', () => {
    const id = '0f8c2a52-6c1e-4d1b-9a43-2f7d1c9e4b10';
    expect(collectionTint(id)).toBe(collectionTint(id));
  });

  it('spreads ids over every curated tint', () => {
    const ids = Array.from(
      { length: 64 },
      (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    );
    const used = new Set(ids.map(collectionTint));
    expect([...used].sort()).toEqual([...FRAME_TINTS].sort());
  });
});
