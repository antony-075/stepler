import type { OperatorReportDetail } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { availableActions } from './actions';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const at = '2026-10-06T10:00:00.000Z';

const detail = (overrides: Partial<OperatorReportDetail> = {}): OperatorReportDetail => ({
  report: {
    id,
    reason: 'PRIVACY',
    description: null,
    status: 'OPEN',
    createdAt: at,
    adminDismissedAt: null,
    hasReporterContact: false,
    resolution: null,
  },
  otherReports: [],
  content: {
    id,
    kind: 'PHOTO',
    frameNo: 86,
    createdAt: at,
    hidden: null,
    quarantined: null,
    deleted: false,
    text: null,
    media: null,
    originalUrl: null,
  },
  collection: { id, title: 'Весілля', status: 'ACTIVE', blocked: null },
  owner: { id, email: 'olena@example.com', status: 'ACTIVE', blockedReason: null },
  ...overrides,
});

describe('availableActions', () => {
  test('an open report on a visible frame of an active collection', () => {
    expect(availableActions(detail())).toEqual([
      'hide',
      'delete',
      'dismiss',
      'action',
      'blockCollection',
      'blockAccount',
    ]);
  });

  test('hidden by the operator: unhide, not hide; hidden by the admin: both', () => {
    const base = detail();
    const operator = availableActions(
      detail({ content: { ...base.content!, hidden: { by: 'OPERATOR', at, reason: 'x' } } }),
    );
    expect(operator).toContain('unhide');
    expect(operator).not.toContain('hide');
    const admin = availableActions(
      detail({ content: { ...base.content!, hidden: { by: 'ADMIN', at, reason: null } } }),
    );
    expect(admin).toEqual(expect.arrayContaining(['hide', 'unhide']));
  });

  test('a deleted frame: neither hide nor delete', () => {
    const actions = availableActions(detail({ content: { ...detail().content!, deleted: true } }));
    expect(actions).not.toContain('hide');
    expect(actions).not.toContain('delete');
    expect(actions).not.toContain('unhide');
  });

  test('a decided report: no decision', () => {
    const actions = availableActions(
      detail({
        report: {
          ...detail().report,
          status: 'ACTIONED',
          resolution: { status: 'ACTIONED', note: 'Так', at },
        },
      }),
    );
    expect(actions).not.toContain('dismiss');
    expect(actions).not.toContain('action');
  });

  test('a blocked collection and owner: their unblocks', () => {
    const actions = availableActions(
      detail({
        collection: { id, title: 'Весілля', status: 'ACTIVE', blocked: { at, reason: 'Спам' } },
        owner: { id, email: 'olena@example.com', status: 'BLOCKED', blockedReason: 'Спам' },
      }),
    );
    expect(actions).toEqual(expect.arrayContaining(['unblockCollection', 'unblockAccount']));
    expect(actions).not.toContain('blockCollection');
  });

  test('a purged collection and frame: nothing on them', () => {
    expect(availableActions(detail({ collection: null, owner: null, content: null }))).toEqual([
      'dismiss',
      'action',
    ]);
  });
});
