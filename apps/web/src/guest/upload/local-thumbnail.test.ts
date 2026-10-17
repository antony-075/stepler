import { describe, expect, test } from 'vitest';
import { fitWithin, THUMB_PX, videoFrameTime } from './local-thumbnail';

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

describe('videoFrameTime', () => {
  test('a second in, past a black first frame', () => {
    expect(videoFrameTime(42.5)).toBe(1);
  });

  test('a clip shorter than two seconds shows its middle', () => {
    expect(videoFrameTime(0.8)).toBe(0.4);
  });

  test('an unknown or endless duration stays on the first frame', () => {
    expect(videoFrameTime(Number.NaN)).toBe(0);
    expect(videoFrameTime(Number.POSITIVE_INFINITY)).toBe(0);
    expect(videoFrameTime(0)).toBe(0);
  });
});
