import type { OperatorAppealDetail } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { availableAppealActions } from './appeal-actions';

const at = '2026-10-06T10:00:00.000Z';
const appeal = (status: OperatorAppealDetail['appeal']['status']) => ({
  appeal: {
    id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
    targetType: 'CONTENT' as const,
    targetId: '01a0ee76-0574-7fe5-a38b-53b07a9b40fa',
    status,
    text: 'Помилка',
    createdAt: at,
    resolution: status === 'OPEN' ? null : { status, note: 'Так', at },
  },
});

describe('availableAppealActions', () => {
  test('an open appeal: uphold and reject', () => {
    expect(availableAppealActions(appeal('OPEN'))).toEqual(['uphold', 'reject']);
  });

  test('a decided appeal: nothing', () => {
    expect(availableAppealActions(appeal('UPHELD'))).toEqual([]);
    expect(availableAppealActions(appeal('REJECTED'))).toEqual([]);
  });
});
