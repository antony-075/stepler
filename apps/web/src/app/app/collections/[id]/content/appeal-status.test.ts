import type { AdminAppeal } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { appealStatusKey, canAppeal } from './appeal-status';

const at = '2026-10-06T10:00:00.000Z';
const appeal = (status: AdminAppeal['status']): AdminAppeal => ({
  id: '0199a000-0000-7000-8000-000000000001',
  targetType: 'CONTENT',
  targetId: '0199a000-0000-7000-8000-000000000002',
  status,
  text: 'Помилка',
  createdAt: at,
  resolution: status === 'OPEN' ? null : { status, note: status === 'REJECTED' ? 'Ні' : null, at },
});

describe('appeal status', () => {
  test('none, under review, upheld, rejected', () => {
    expect(appealStatusKey(null)).toBe('none');
    expect(appealStatusKey(appeal('OPEN'))).toBe('open');
    expect(appealStatusKey(appeal('UPHELD'))).toBe('upheld');
    expect(appealStatusKey(appeal('REJECTED'))).toBe('rejected');
  });

  test('a new appeal is allowed unless one is under review', () => {
    expect(canAppeal(null)).toBe(true);
    expect(canAppeal(appeal('OPEN'))).toBe(false);
    expect(canAppeal(appeal('REJECTED'))).toBe(true);
    expect(canAppeal(appeal('UPHELD'))).toBe(true);
  });
});
