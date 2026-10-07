import { describe, expect, test } from 'vitest';
import { addDays, addInterval, isActiveAt, laterOf } from './periods.js';

const at = (iso: string) => new Date(iso);

describe('addInterval', () => {
  test('a month after the 31st clamps to the end of February', () => {
    expect(addInterval(at('2027-01-31T10:00:00Z'), 'MONTH')).toEqual(at('2027-02-28T10:00:00Z'));
    expect(addInterval(at('2028-01-31T10:00:00Z'), 'MONTH')).toEqual(at('2028-02-29T10:00:00Z'));
  });

  test('a year after a leap day clamps to February 28', () => {
    expect(addInterval(at('2028-02-29T00:00:00Z'), 'YEAR')).toEqual(at('2029-02-28T00:00:00Z'));
  });

  test('counts several months from the start, not month by month', () => {
    expect(addInterval(at('2027-01-31T00:00:00Z'), 'MONTH', 2)).toEqual(at('2027-03-31T00:00:00Z'));
    expect(addInterval(at('2027-10-15T12:30:00Z'), 'MONTH', 12)).toEqual(
      at('2028-10-15T12:30:00Z'),
    );
  });

  test('is UTC: a Kyiv DST change does not move the time of day', () => {
    expect(addInterval(at('2027-03-15T21:59:00Z'), 'MONTH')).toEqual(at('2027-04-15T21:59:00Z'));
  });
});

test('addDays counts 24-hour days', () => {
  expect(addDays(at('2027-03-27T22:00:00Z'), 7)).toEqual(at('2027-04-03T22:00:00Z'));
});

describe('isActiveAt', () => {
  const end = at('2027-01-01T00:00:00Z');

  test('the end itself is no longer active', () => {
    expect(isActiveAt(end, end)).toBe(false);
    expect(isActiveAt(new Date(end.getTime() - 1), end)).toBe(true);
  });

  test('no end = open-ended', () => {
    expect(isActiveAt(end, null)).toBe(true);
  });
});

test('laterOf picks the later date', () => {
  expect(laterOf(at('2027-01-01T00:00:00Z'), at('2026-01-01T00:00:00Z'))).toEqual(
    at('2027-01-01T00:00:00Z'),
  );
});
