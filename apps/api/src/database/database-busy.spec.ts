import { describe, expect, test } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { isDatabaseBusy } from './database-busy.js';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

describe('isDatabaseBusy', () => {
  test('pool and transaction timeouts, an unreachable server: busy', () => {
    for (const code of ['P2024', 'P2028', 'P1001', 'P1002', 'P1017']) {
      expect(isDatabaseBusy(known(code))).toBe(true);
    }
    expect(isDatabaseBusy(new Error('timeout exceeded when trying to connect'))).toBe(true);
  });

  test('a constraint or a missing row is a real answer, not a busy database', () => {
    expect(isDatabaseBusy(known('P2002'))).toBe(false);
    expect(isDatabaseBusy(known('P2025'))).toBe(false);
    expect(isDatabaseBusy(new Error('boom'))).toBe(false);
    expect(isDatabaseBusy('P2028')).toBe(false);
  });
});
