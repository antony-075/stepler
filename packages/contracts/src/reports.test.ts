import { describe, expect, test } from 'vitest';
import {
  adminReportSchema,
  contentModerationSchema,
  createReportRequestSchema,
  ERROR_CODES,
  moderationTextSchema,
  REPORT_REASONS,
} from './index.js';

describe('createReportRequestSchema', () => {
  test('a reason and the locale are enough', () => {
    expect(createReportRequestSchema.parse({ reason: 'SPAM', locale: 'uk' })).toEqual({
      reason: 'SPAM',
      locale: 'uk',
    });
  });

  test('takes a description and an e-mail; trims the description', () => {
    expect(
      createReportRequestSchema.parse({
        reason: 'PRIVACY',
        description: '  Це я на фото \n',
        email: 'r@example.com',
        locale: 'en',
      }),
    ).toEqual({
      reason: 'PRIVACY',
      description: 'Це я на фото',
      email: 'r@example.com',
      locale: 'en',
    });
  });

  test('counts the description in code points: 1000 pass, 1001 do not', () => {
    const ok = 'я'.repeat(500) + '😀'.repeat(500);
    expect(
      createReportRequestSchema.safeParse({ reason: 'OTHER', description: ok, locale: 'uk' })
        .success,
    ).toBe(true);
    expect(
      createReportRequestSchema.safeParse({ reason: 'OTHER', description: `${ok}😀`, locale: 'uk' })
        .success,
    ).toBe(false);
  });

  test.each([
    { reason: 'SPAM', locale: 'uk', email: 'x' },
    { reason: 'RUDE', locale: 'uk' },
    { reason: 'SPAM', locale: 'uk', extra: 1 },
    { reason: 'SPAM', locale: 'uk', description: '   ' },
    { reason: 'SPAM', locale: 'uk', description: '\u0007' },
    { reason: 'SPAM', locale: 'de' },
    { reason: 'SPAM' },
  ])('rejects %j', (body) => {
    expect(createReportRequestSchema.safeParse(body).success).toBe(false);
  });

  test('every reason is accepted', () => {
    for (const reason of REPORT_REASONS) {
      expect(createReportRequestSchema.safeParse({ reason, locale: 'uk' }).success).toBe(true);
    }
  });
});

describe('moderationTextSchema', () => {
  test('1 to 500 code points, trimmed, line breaks kept', () => {
    expect(moderationTextSchema.parse(' Порушення\nприватності ')).toBe('Порушення\nприватності');
    expect(moderationTextSchema.safeParse('😀'.repeat(500)).success).toBe(true);
    expect(moderationTextSchema.safeParse('a'.repeat(501)).success).toBe(false);
    expect(moderationTextSchema.safeParse('').success).toBe(false);
    expect(moderationTextSchema.safeParse('  ').success).toBe(false);
    expect(moderationTextSchema.safeParse('a\u0000b').success).toBe(false);
  });
});

describe('what the admin sees', () => {
  test('a report has no contact field (R2)', () => {
    expect(Object.keys(adminReportSchema.shape).filter((key) => /mail/i.test(key))).toEqual([]);
    expect(
      adminReportSchema.safeParse({
        id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
        reason: 'SPAM',
        description: null,
        createdAt: '2026-10-06T10:00:00.000Z',
        email: 'r@example.com',
      }).success,
    ).toBe(false);
  });

  test('moderation: hidden by an admin or the operator', () => {
    const at = '2026-10-06T10:00:00.000Z';
    expect(contentModerationSchema.parse({ hidden: null, openReports: 0 })).toEqual({
      hidden: null,
      openReports: 0,
    });
    expect(
      contentModerationSchema.safeParse({
        hidden: { by: 'OPERATOR', at, reason: 'Порушення' },
        openReports: 2,
      }).success,
    ).toBe(true);
    expect(
      contentModerationSchema.safeParse({
        hidden: { by: 'GUEST', at, reason: null },
        openReports: 0,
      }).success,
    ).toBe(false);
  });
});

test('the moderation error codes are appended', () => {
  expect(ERROR_CODES.slice(-2)).toEqual(['CONTENT_MODERATED', 'REPORT_RESOLVED']);
});
