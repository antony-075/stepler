import { describe, expect, test } from 'vitest';
import {
  adminAppealSchema,
  appealTextSchema,
  createAppealRequestSchema,
  ERROR_CODES,
} from './index.js';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const at = '2026-10-06T10:00:00.000Z';

describe('appealTextSchema', () => {
  test('1 to 1000 code points, trimmed, line breaks kept', () => {
    expect(appealTextSchema.parse('  Це моє фото\nз дозволу  ')).toBe('Це моє фото\nз дозволу');
    expect(appealTextSchema.safeParse('').success).toBe(false);
    expect(appealTextSchema.safeParse('   ').success).toBe(false);
    expect(appealTextSchema.safeParse('я'.repeat(1000)).success).toBe(true);
    expect(appealTextSchema.safeParse('😀'.repeat(1000)).success).toBe(true);
    expect(appealTextSchema.safeParse('я'.repeat(1001)).success).toBe(false);
    expect(appealTextSchema.safeParse('a\u0007b').success).toBe(false);
  });

  test('the request takes the text and nothing else', () => {
    expect(createAppealRequestSchema.parse({ text: 'Помилка' })).toEqual({ text: 'Помилка' });
    expect(createAppealRequestSchema.safeParse({ text: 'x', reason: 'y' }).success).toBe(false);
    expect(createAppealRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('what the admin sees', () => {
  test('an appeal with or without a decision; never who decided', () => {
    const open = {
      id,
      targetType: 'CONTENT',
      targetId: id,
      status: 'OPEN',
      text: 'Це моє фото',
      createdAt: at,
      resolution: null,
    };
    expect(adminAppealSchema.parse(open)).toEqual(open);
    const rejected = {
      ...open,
      status: 'REJECTED',
      resolution: { status: 'REJECTED', note: 'Порушення підтверджено', at },
    };
    expect(adminAppealSchema.parse(rejected)).toEqual(rejected);
    expect(Object.keys(adminAppealSchema.shape).filter((key) => /user|mail/i.test(key))).toEqual(
      [],
    );
    expect(adminAppealSchema.safeParse({ ...open, resolvedByUserId: id }).success).toBe(false);
  });
});

test('the appeal error codes follow the moderation ones', () => {
  const at = ERROR_CODES.indexOf('APPEAL_NOT_APPLICABLE');
  expect(ERROR_CODES[at - 1]).toBe('REPORT_RESOLVED');
  expect(ERROR_CODES.slice(at, at + 3)).toEqual([
    'APPEAL_NOT_APPLICABLE',
    'APPEAL_OPEN',
    'APPEAL_RESOLVED',
  ]);
});
