import { describe, expect, test } from 'vitest';
import { stateCount, stateFilterOf, statesFromParams } from './content-filters';
import { moderationMarks } from './moderation-marks';

const at = '2026-10-06T10:00:00.000Z';

describe('moderation marks', () => {
  test('none, reported, admin-hidden and reported, operator-hidden', () => {
    expect(
      moderationMarks({ moderation: { hidden: null, quarantined: null, openReports: 0 } }),
    ).toEqual([]);
    expect(
      moderationMarks({ moderation: { hidden: null, quarantined: null, openReports: 2 } }),
    ).toEqual(['reported']);
    expect(
      moderationMarks({
        moderation: {
          hidden: { by: 'ADMIN', at, reason: null },
          quarantined: null,
          openReports: 1,
        },
      }),
    ).toEqual(['reported', 'hidden']);
    expect(
      moderationMarks({
        moderation: {
          hidden: { by: 'OPERATOR', at, reason: 'Спам' },
          quarantined: null,
          openReports: 0,
        },
      }),
    ).toEqual(['moderated']);
  });

  test('?state=… (repeatable) is the state filter (F1a); unknown values are dropped', () => {
    expect(statesFromParams(['active'])).toEqual(['ACTIVE']);
    expect(statesFromParams(['reported', 'hidden-admin', 'reported', 'x'])).toEqual([
      'HIDDEN_ADMIN',
      'REPORTED',
    ]);
    expect(statesFromParams(['REPORTED'])).toEqual([]);
    expect(statesFromParams([])).toEqual([]);
    expect(stateFilterOf('HIDDEN_OPERATOR')).toBe('hidden-operator');
    const counts = { active: 3, hiddenByAdmin: 1, hiddenByOperator: 2, reported: 4 };
    expect(stateCount(counts, 'active')).toBe(3);
    expect(stateCount(counts, 'hidden-operator')).toBe(2);
    expect(stateCount(counts, 'reported')).toBe(4);
  });
});
