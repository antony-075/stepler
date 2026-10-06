import { describe, expect, test } from 'vitest';
import {
  operatorActionRequestSchema,
  operatorReportDetailSchema,
  operatorReportListQuerySchema,
  operatorReportRowSchema,
  resolveReportRequestSchema,
} from './index.js';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const at = '2026-10-06T10:00:00.000Z';

describe('operatorReportListQuerySchema', () => {
  test('open reports, 50 per page by default', () => {
    expect(operatorReportListQuerySchema.parse({})).toEqual({ status: 'OPEN', limit: 50 });
    expect(operatorReportListQuerySchema.parse({ status: 'DISMISSED', limit: '2' })).toEqual({
      status: 'DISMISSED',
      limit: 2,
    });
    expect(operatorReportListQuerySchema.safeParse({ status: 'open' }).success).toBe(false);
    expect(operatorReportListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('queue rows', () => {
  test('content and collection may be gone (reports outlive them)', () => {
    const row = {
      id,
      reason: 'SPAM',
      status: 'OPEN',
      createdAt: at,
      content: { id, kind: 'PHOTO', frameNo: 86, state: 'HIDDEN' },
      collection: { id, title: 'Весілля' },
      openReportsOnItem: 2,
    };
    expect(operatorReportRowSchema.parse(row)).toEqual(row);
    expect(
      operatorReportRowSchema.safeParse({ ...row, content: null, collection: null }).success,
    ).toBe(true);
  });
});

describe('the detail', () => {
  const detail = {
    report: {
      id,
      reason: 'PRIVACY',
      description: 'Це я на фото',
      status: 'OPEN',
      createdAt: at,
      adminDismissedAt: null,
      hasReporterContact: true,
      resolution: null,
    },
    otherReports: [],
    content: null,
    collection: null,
    owner: null,
  };

  test('says whether a contact was left, never the address', () => {
    expect(operatorReportDetailSchema.parse(detail)).toEqual(detail);
    expect(
      operatorReportDetailSchema.safeParse({
        ...detail,
        report: { ...detail.report, reporterEmail: 'r@example.com' },
      }).success,
    ).toBe(false);
  });
});

describe('actions need a reason', () => {
  test('resolve: a status and a note', () => {
    expect(resolveReportRequestSchema.parse({ status: 'ACTIONED', note: ' Приховано ' })).toEqual({
      status: 'ACTIONED',
      note: 'Приховано',
    });
    expect(resolveReportRequestSchema.safeParse({ status: 'OPEN', note: 'x' }).success).toBe(false);
    expect(resolveReportRequestSchema.safeParse({ status: 'DISMISSED' }).success).toBe(false);
  });

  test('every other action: a non-empty reason', () => {
    expect(operatorActionRequestSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(operatorActionRequestSchema.safeParse({ reason: 'Спам' }).success).toBe(true);
    expect(operatorActionRequestSchema.safeParse({}).success).toBe(false);
  });
});
