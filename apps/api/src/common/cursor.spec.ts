import { describe, expect, test } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const base64url = (value: string): string => Buffer.from(value).toString('base64url');

describe('cursor', () => {
  test('round-trips the position to the millisecond', () => {
    const position = { createdAt: new Date('2026-10-01T10:00:00.123Z'), id };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  test('returns null for anything malformed', () => {
    expect(decodeCursor('x')).toBeNull();
    expect(decodeCursor(base64url('{"a":1}'))).toBeNull();
    expect(decodeCursor(base64url('not json'))).toBeNull();
    expect(
      decodeCursor(base64url(JSON.stringify({ c: '2026-10-01T10:00:00.000Z', i: 'x' }))),
    ).toBeNull();
    expect(decodeCursor(base64url(JSON.stringify({ c: 'yesterday', i: id })))).toBeNull();
  });
});
