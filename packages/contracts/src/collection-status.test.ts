import { describe, expect, test } from 'vitest';
import {
  COLLECTION_DISPLAY_STATUSES,
  collectionClosedToGuests,
  collectionDisplayStatus,
} from './collection-status.js';

const BLOCK = { at: '2026-10-06T10:00:00.000Z', reason: 'Спам' };

describe('collectionDisplayStatus (owner remark S1)', () => {
  test.each([
    ['ACTIVE', null, 'ACTIVE'],
    ['ARCHIVED', null, 'ARCHIVED'],
    ['DELETING', null, 'DELETING'],
    ['ACTIVE', BLOCK, 'BLOCKED'],
    ['ARCHIVED', BLOCK, 'BLOCKED'],
    ['DELETING', BLOCK, 'BLOCKED'],
  ] as const)('%s + blocked=%o → %s', (status, blocked, expected) => {
    expect(collectionDisplayStatus({ status, blocked })).toBe(expected);
  });

  test('a missing `blocked` field (older payloads) reads as not blocked', () => {
    expect(collectionDisplayStatus({ status: 'ACTIVE', blocked: undefined })).toBe('ACTIVE');
  });

  test('lists every status once, in precedence order', () => {
    expect(COLLECTION_DISPLAY_STATUSES).toEqual(['BLOCKED', 'DELETING', 'ARCHIVED', 'ACTIVE']);
  });
});

describe('collectionClosedToGuests', () => {
  test('only an active, unblocked collection is open', () => {
    expect(collectionClosedToGuests({ status: 'ACTIVE', blocked: null })).toBe(false);
    expect(collectionClosedToGuests({ status: 'ACTIVE', blocked: BLOCK })).toBe(true);
    expect(collectionClosedToGuests({ status: 'ARCHIVED', blocked: null })).toBe(true);
    expect(collectionClosedToGuests({ status: 'DELETING', blocked: null })).toBe(true);
  });
});
