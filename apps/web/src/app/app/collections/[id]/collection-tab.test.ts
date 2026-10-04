import { describe, expect, test } from 'vitest';
import { tabOf } from './collection-tab';

describe('tabOf', () => {
  test.each([
    ['appearance', 'appearance'],
    ['links', 'links'],
    ['settings', 'settings'],
    ['content', 'content'],
    ['x', 'content'],
    [null, 'content'],
  ] as const)('%s → %s', (value, expected) => {
    expect(tabOf(value)).toBe(expected);
  });
});
