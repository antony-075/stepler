import { describe, expect, it } from 'vitest';
import { chunks, rangeSelect, toggle } from './selection';

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('toggle', () => {
  it('adds a missing id and removes a present one, without changing the input', () => {
    const start = new Set(['a']);
    expect([...toggle(start, 'b')]).toEqual(['a', 'b']);
    expect([...toggle(start, 'a')]).toEqual([]);
    expect([...start]).toEqual(['a']);
  });
});

describe('rangeSelect', () => {
  it('selects forward from the anchor to the target, both included', () => {
    expect(rangeSelect(IDS, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('selects backward the same way', () => {
    expect(rangeSelect(IDS, 'e', 'c')).toEqual(['c', 'd', 'e']);
  });

  it('without an anchor (or one no longer listed) only the target', () => {
    expect(rangeSelect(IDS, null, 'c')).toEqual(['c']);
    expect(rangeSelect(IDS, 'gone', 'c')).toEqual(['c']);
  });

  it('a target not in the list selects nothing', () => {
    expect(rangeSelect(IDS, 'a', 'zzz')).toEqual([]);
  });
});

describe('chunks', () => {
  it('splits 250 ids into requests of 100, 100 and 50', () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    expect(chunks(ids).map((chunk) => chunk.length)).toEqual([100, 100, 50]);
  });
});
