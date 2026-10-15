import { describe, expect, test } from 'vitest';
import { fitWithin, THUMB_PX } from './local-thumbnail';

describe('fitWithin', () => {
  test('a 48 MP portrait photo shrinks to the thumbnail on its longer side', () => {
    expect(fitWithin(6048, 8064, THUMB_PX)).toEqual({ width: 240, height: 320 });
  });

  test('a landscape photo keeps its ratio; a small image is never enlarged', () => {
    expect(fitWithin(4032, 3024, THUMB_PX)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(200, 100, THUMB_PX)).toEqual({ width: 200, height: 100 });
  });

  test('an extreme panorama keeps at least one pixel', () => {
    expect(fitWithin(100_000, 10, THUMB_PX)).toEqual({ width: 320, height: 1 });
  });
});
