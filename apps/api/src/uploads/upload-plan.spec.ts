import { describe, expect, test } from 'vitest';
import { partLength, planUpload, uploadKey } from './upload-plan.js';

const MIB = 1_048_576n;
const cfg = { singlePutMax: 100_000_000n, partSize: 10n * MIB };

describe('planUpload', () => {
  test('up to the single-PUT maximum: one PUT', () => {
    expect(planUpload(1n, cfg)).toEqual({ strategy: 'SINGLE' });
    expect(planUpload(100_000_000n, cfg)).toEqual({ strategy: 'SINGLE' });
  });

  test('above it: multipart, the last part shorter', () => {
    expect(planUpload(100_000_001n, cfg)).toEqual({
      strategy: 'MULTIPART',
      partSizeBytes: 10n * MIB,
      partCount: 10,
    });
    expect(planUpload(2_000_000_000n, cfg)).toMatchObject({ partCount: 191 });
    expect(planUpload(30n * MIB, { singlePutMax: 1n, partSize: 10n * MIB })).toMatchObject({
      partCount: 3,
    });
  });

  test('more than 10 000 parts is refused', () => {
    expect(() => planUpload(10_001n * 5n * MIB, { singlePutMax: 1n, partSize: 5n * MIB })).toThrow(
      RangeError,
    );
  });
});

describe('partLength', () => {
  test('full parts, then the remainder', () => {
    const size = 10n * MIB + 1234n;
    expect(partLength(size, 5n * MIB, 1)).toBe(5n * MIB);
    expect(partLength(size, 5n * MIB, 2)).toBe(5n * MIB);
    expect(partLength(size, 5n * MIB, 3)).toBe(1234n);
    expect(partLength(15n * MIB, 5n * MIB, 3)).toBe(5n * MIB);
  });
});

test('uploadKey holds no user data', () => {
  expect(uploadKey('c1', 'u1')).toBe('collections/c1/uploads/u1/original');
});
