import { describe, expect, test } from 'vitest';
import { partLength, planUpload, uploadKey } from './upload-plan.js';

const MIB = 1_048_576n;

describe('planUpload', () => {
  test('a file up to the part size is one part', () => {
    expect(planUpload(1n, 10n * MIB)).toEqual({ partSizeBytes: 10n * MIB, partCount: 1 });
    expect(planUpload(10n * MIB, 10n * MIB)).toMatchObject({ partCount: 1 });
  });

  test('larger files: fixed parts, the last one shorter', () => {
    expect(planUpload(10n * MIB + 1n, 10n * MIB)).toMatchObject({ partCount: 2 });
    expect(planUpload(2_000_000_000n, 10n * MIB)).toMatchObject({ partCount: 191 });
  });

  test('more than 10 000 parts is refused', () => {
    expect(() => planUpload(10_001n * 5n * MIB, 5n * MIB)).toThrow(RangeError);
  });
});

describe('partLength', () => {
  test('full parts, then the remainder; a one-part file is its own length', () => {
    const size = 10n * MIB + 1234n;
    expect(partLength(size, 5n * MIB, 1)).toBe(5n * MIB);
    expect(partLength(size, 5n * MIB, 3)).toBe(1234n);
    expect(partLength(15n * MIB, 5n * MIB, 3)).toBe(5n * MIB);
    expect(partLength(100n, 10n * MIB, 1)).toBe(100n);
  });
});

test('uploadKey holds no user data', () => {
  expect(uploadKey('c1', 'u1')).toBe('collections/c1/uploads/u1/original');
});
