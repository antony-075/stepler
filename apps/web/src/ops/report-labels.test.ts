import { REPORT_REASONS } from '@stepler/contracts';
import { expect, test } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import { paramOfStatus, statusFromParam } from './report-labels';

test('the status tab comes from the URL; anything else is «Нові»', () => {
  expect(statusFromParam('dismissed')).toBe('DISMISSED');
  expect(statusFromParam('actioned')).toBe('ACTIONED');
  expect(statusFromParam('open')).toBe('OPEN');
  expect(statusFromParam('x')).toBe('OPEN');
  expect(statusFromParam(null)).toBe('OPEN');
  expect(paramOfStatus('DISMISSED')).toBe('dismissed');
});

test('every report reason has its uk and en label', () => {
  for (const reason of REPORT_REASONS) {
    expect(uk.ops.reasons[reason]).toBeTruthy();
    expect(en.ops.reasons[reason]).toBeTruthy();
  }
});
