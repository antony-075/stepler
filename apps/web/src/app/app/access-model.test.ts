import { describe, expect, test } from 'vitest';
import { accountBanner, daysLeft, writeLock } from './access-model';

const now = new Date('2027-06-15T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 3600_000).toISOString();

describe('accountBanner', () => {
  test('the trial reminder: only in the last three days, rounded up', () => {
    expect(accountBanner({ state: 'ACTIVE', reason: 'TRIAL', endsAt: inDays(3) }, now)).toEqual({
      kind: 'trial',
      days: 3,
    });
    expect(accountBanner({ state: 'ACTIVE', reason: 'TRIAL', endsAt: inDays(2.1) }, now)).toEqual({
      kind: 'trial',
      days: 3,
    });
    expect(
      accountBanner({ state: 'ACTIVE', reason: 'TRIAL', endsAt: inDays(3.1) }, now),
    ).toBeNull();
    expect(accountBanner({ state: 'ACTIVE', reason: 'TRIAL', endsAt: inDays(6) }, now)).toBeNull();
  });

  test('read-only says why; grace says until when; a plan says nothing', () => {
    expect(accountBanner({ state: 'READ_ONLY', reason: 'TRIAL_ENDED', endsAt: null }, now)).toEqual(
      { kind: 'readOnly', reason: 'TRIAL_ENDED' },
    );
    expect(
      accountBanner({ state: 'GRACE', reason: 'SUBSCRIPTION_PAST_DUE', endsAt: inDays(2) }, now),
    ).toEqual({ kind: 'grace', until: inDays(2) });
    expect(
      accountBanner({ state: 'ACTIVE', reason: 'COMPLIMENTARY', endsAt: null }, now),
    ).toBeNull();
  });
});

test('daysLeft rounds up: a fresh trial says 7, the last partial day 1, 0 only after the end', () => {
  // A new trial (7 days from sign-up), a minute later: still «ще 7 днів».
  expect(daysLeft(inDays(7 - 1 / (24 * 60)), now)).toBe(7);
  expect(daysLeft(inDays(7), now)).toBe(7);
  expect(daysLeft(inDays(5.5), now)).toBe(6);
  expect(daysLeft(inDays(0.4), now)).toBe(1);
  expect(daysLeft(inDays(0), now)).toBe(0);
  expect(daysLeft(inDays(-1), now)).toBe(0);
});

test('writeLock points at the sentence that explains it', () => {
  const access = { state: 'READ_ONLY', reason: 'TRIAL_ENDED', endsAt: null } as const;
  expect(writeLock({ access, entitlement: 'ACCOUNT' })).toEqual({
    locked: true,
    describedBy: 'account-access-reason',
  });
  expect(
    writeLock({ access: { ...access, reason: 'PACK_RETENTION_ENDED' }, entitlement: 'PACK' }),
  ).toEqual({ locked: true, describedBy: 'collection-access-reason' });
  expect(
    writeLock({
      access: { state: 'COLLECTING_CLOSED', reason: 'PACK_WINDOW_ENDED', endsAt: null },
      entitlement: 'PACK',
    }).locked,
  ).toBe(false);
});
