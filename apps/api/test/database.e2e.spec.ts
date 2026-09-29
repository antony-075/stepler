import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { constraintViolation } from '../src/database/constraint-violation.js';
import { createTestPrisma, resetDatabase } from './support/database.js';

const prisma = createTestPrisma();

async function violation(
  promise: Promise<unknown>,
): Promise<ReturnType<typeof constraintViolation>> {
  try {
    await promise;
  } catch (error) {
    return constraintViolation(error);
  }
  throw new Error('expected a constraint violation');
}

describe('identity schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('email is unique case-insensitively (citext)', async () => {
    await prisma.user.create({ data: { email: 'Anton@Example.com' } });
    expect(await violation(prisma.user.create({ data: { email: 'anton@example.com' } }))).toEqual({
      kind: 'unique',
      constraint: 'User_email_key',
    });
    expect(await prisma.user.findUnique({ where: { email: 'ANTON@example.COM' } })).not.toBeNull();
  });

  test('BLOCKED requires blockedAt, and blockedAt requires BLOCKED', async () => {
    const blocked = { kind: 'check', constraint: 'User_blocked_consistent' };
    expect(
      await violation(prisma.user.create({ data: { email: 'a@x.io', status: 'BLOCKED' } })),
    ).toEqual(blocked);
    expect(
      await violation(prisma.user.create({ data: { email: 'b@x.io', blockedAt: new Date() } })),
    ).toEqual(blocked);
    await prisma.user.create({
      data: { email: 'c@x.io', status: 'BLOCKED', blockedAt: new Date() },
    });
  });

  test('displayName is at most 80 characters', async () => {
    await prisma.user.create({ data: { email: 'a@x.io', displayName: 'x'.repeat(80) } });
    expect(
      await violation(
        prisma.user.create({ data: { email: 'b@x.io', displayName: 'x'.repeat(81) } }),
      ),
    ).toEqual({ kind: 'check', constraint: 'User_displayName_length' });
  });

  test('provider accounts are unique per provider', async () => {
    const user = await prisma.user.create({ data: { email: 'a@x.io' } });
    await prisma.authAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: 'g-1' },
    });
    expect(
      await violation(
        prisma.authAccount.create({
          data: { userId: user.id, provider: 'GOOGLE', providerAccountId: 'g-1' },
        }),
      ),
    ).toEqual({ kind: 'unique', constraint: 'AuthAccount_provider_providerAccountId_key' });
  });

  test('deleting a user cascades to accounts and sessions', async () => {
    const user = await prisma.user.create({ data: { email: 'a@x.io' } });
    await prisma.authAccount.create({
      data: { userId: user.id, provider: 'EMAIL', providerAccountId: 'a@x.io' },
    });
    await prisma.authSession.create({
      data: { userId: user.id, tokenHash: 'h1', expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.authAccount.count()).toBe(0);
    expect(await prisma.authSession.count()).toBe(0);
  });

  test('ids from sequential inserts are UUIDv7 and sort by creation', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await prisma.user.create({ data: { email: `u${i}@x.io` } })).id);
    }
    expect(ids.every((id) => id[14] === '7')).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });
});
