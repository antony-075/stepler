import { describe, expect, test } from 'vitest';
import { appealStatusFromParam, MEASURE_BADGE, paramOfAppealStatus } from './appeal-labels';

describe('appeal labels', () => {
  test('?status= of the appeal queue; unknown is «Нові»', () => {
    expect(appealStatusFromParam('upheld')).toBe('UPHELD');
    expect(appealStatusFromParam('rejected')).toBe('REJECTED');
    expect(appealStatusFromParam('OPEN')).toBe('OPEN');
    expect(appealStatusFromParam('x')).toBe('OPEN');
    expect(appealStatusFromParam(null)).toBe('OPEN');
    expect(paramOfAppealStatus('UPHELD')).toBe('upheld');
  });

  test('a measure in force is coloured; a reversed one is neutral', () => {
    expect(MEASURE_BADGE.BLOCKED).toBe('danger');
    expect(MEASURE_BADGE.QUARANTINED).toBe('warning');
    expect(MEASURE_BADGE.NONE).toBe('neutral');
  });
});
