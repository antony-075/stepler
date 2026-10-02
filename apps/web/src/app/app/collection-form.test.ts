import { describe, expect, test } from 'vitest';
import {
  collectionFormSchema,
  DESCRIPTION_MAX,
  TITLE_MAX,
  toCollectionRequest,
} from './collection-form';

describe('collection form', () => {
  test('maps a blank description to null and trims the title', () => {
    const values = collectionFormSchema.parse({ title: ' A ', description: '  ' });
    expect(toCollectionRequest(values)).toEqual({ title: 'A', description: null });
  });

  test('keeps a description with its line breaks', () => {
    const values = collectionFormSchema.parse({ title: 'A', description: ' Line 1\nLine 2 ' });
    expect(toCollectionRequest(values)).toEqual({ title: 'A', description: 'Line 1\nLine 2' });
  });

  test('rejects a 1001-character description and an empty title', () => {
    expect(
      collectionFormSchema.safeParse({ title: 'A', description: 'x'.repeat(1001) }).success,
    ).toBe(false);
    expect(collectionFormSchema.safeParse({ title: '   ', description: '' }).success).toBe(false);
    expect(
      collectionFormSchema.safeParse({ title: 'x'.repeat(100), description: 'x'.repeat(1000) })
        .success,
    ).toBe(true);
  });

  test('the input limits come from the contract', () => {
    expect([TITLE_MAX, DESCRIPTION_MAX]).toEqual([100, 1000]);
  });
});
