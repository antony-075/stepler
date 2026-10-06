import { describe, expect, test } from 'vitest';
import { reportedFromParam } from './content-filters';
import { moderationMarks } from './moderation-marks';

const at = '2026-10-06T10:00:00.000Z';

describe('moderation marks', () => {
  test('none, reported, admin-hidden and reported, operator-hidden', () => {
    expect(moderationMarks({ moderation: { hidden: null, openReports: 0 } })).toEqual([]);
    expect(moderationMarks({ moderation: { hidden: null, openReports: 2 } })).toEqual(['reported']);
    expect(
      moderationMarks({
        moderation: { hidden: { by: 'ADMIN', at, reason: null }, openReports: 1 },
      }),
    ).toEqual(['reported', 'hidden']);
    expect(
      moderationMarks({
        moderation: { hidden: { by: 'OPERATOR', at, reason: 'Спам' }, openReports: 0 },
      }),
    ).toEqual(['moderated']);
  });

  test('?reported=1 is the «Скарги» filter; nothing else is', () => {
    expect(reportedFromParam('1')).toBe(true);
    expect(reportedFromParam('true')).toBe(false);
    expect(reportedFromParam(null)).toBe(false);
  });
});
