import { describe, expect, test } from 'vitest';
import {
  type AccessInput,
  type AccountSource,
  type EntitlementLimits,
  type PackSource,
  resolveAccess,
} from './access.js';

const GiB = 1024n ** 3n;
const now = new Date('2027-06-15T12:00:00Z');
const past = new Date('2027-06-01T00:00:00Z');
const future = new Date('2027-07-01T00:00:00Z');

const trialLimits: EntitlementLimits = {
  activeCollections: 1,
  storageBytes: GiB,
  collectionStorageBytes: GiB,
  guestLinks: 10,
  windowDays: null,
  retentionDays: null,
};
const businessLimits: EntitlementLimits = {
  activeCollections: 20,
  storageBytes: 1024n * GiB,
  collectionStorageBytes: 1024n * GiB,
  guestLinks: 50,
  windowDays: null,
  retentionDays: null,
};

function subscription(overrides: Partial<AccountSource> = {}): AccountSource {
  return {
    kind: 'SUBSCRIPTION',
    status: 'ACTIVE',
    currentPeriodEnd: future,
    graceEndsAt: null,
    endedAt: null,
    limits: businessLimits,
    ...overrides,
  };
}

const liveTrial = { endsAt: future, limits: trialLimits };
const endedTrial = { endsAt: past, limits: trialLimits };

function input(overrides: Partial<AccessInput>): AccessInput {
  return { trial: endedTrial, account: null, ...overrides };
}

describe('the account', () => {
  test('a live trial is active with the trial limits', () => {
    expect(resolveAccess(input({ trial: liveTrial }), now)).toEqual({
      state: 'ACTIVE',
      reason: 'TRIAL',
      endsAt: future,
      graceEndsAt: null,
      endedAt: null,
      limits: trialLimits,
    });
  });

  test('an ended trial without a plan is read-only from the trial end', () => {
    expect(resolveAccess(input({}), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'TRIAL_ENDED',
      endsAt: null,
      endedAt: past,
      limits: trialLimits,
    });
  });

  test('the trial ends exactly at its end', () => {
    expect(resolveAccess(input({ trial: { ...liveTrial, endsAt: now } }), now).state).toBe(
      'READ_ONLY',
    );
  });

  test('a subscription wins over a live trial', () => {
    expect(resolveAccess(input({ trial: liveTrial, account: subscription() }), now)).toMatchObject({
      state: 'ACTIVE',
      reason: 'SUBSCRIPTION',
      endsAt: future,
      limits: businessLimits,
    });
  });

  test('a past-due subscription is in grace until the grace ends', () => {
    const pastDue = subscription({
      status: 'PAST_DUE',
      currentPeriodEnd: past,
      graceEndsAt: future,
    });
    expect(resolveAccess(input({ account: pastDue }), now)).toMatchObject({
      state: 'GRACE',
      reason: 'SUBSCRIPTION_PAST_DUE',
      endsAt: future,
      graceEndsAt: future,
      limits: businessLimits,
    });
  });

  test('after the grace it is read-only from the period end', () => {
    const lapsed = subscription({
      status: 'PAST_DUE',
      currentPeriodEnd: new Date('2027-06-05T00:00:00Z'),
      graceEndsAt: new Date('2027-06-09T00:00:00Z'),
    });
    expect(resolveAccess(input({ account: lapsed }), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: new Date('2027-06-05T00:00:00Z'),
      graceEndsAt: null,
    });
  });

  test('a cancelled subscription stays active until its period ends', () => {
    expect(
      resolveAccess(input({ account: subscription({ status: 'CANCELED' }) }), now),
    ).toMatchObject({ state: 'ACTIVE', reason: 'SUBSCRIPTION', endsAt: future });
    const over = subscription({ status: 'CANCELED', currentPeriodEnd: past });
    expect(resolveAccess(input({ account: over }), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: past,
    });
  });

  test('an expired subscription ended at its end, a later trial end does not hide it', () => {
    const ended = new Date('2027-06-10T00:00:00Z');
    const expired = subscription({ status: 'EXPIRED', currentPeriodEnd: ended, endedAt: ended });
    expect(resolveAccess(input({ account: expired }), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: ended,
      limits: businessLimits,
    });
  });

  test('a live trial wins over an ended subscription', () => {
    const expired = subscription({ status: 'EXPIRED', currentPeriodEnd: past, endedAt: past });
    expect(resolveAccess(input({ trial: liveTrial, account: expired }), now).reason).toBe('TRIAL');
  });

  test('a complimentary grant without an end is active', () => {
    const grant = subscription({ kind: 'COMPLIMENTARY', currentPeriodEnd: null });
    expect(resolveAccess(input({ account: grant }), now)).toMatchObject({
      state: 'ACTIVE',
      reason: 'COMPLIMENTARY',
      endsAt: null,
      limits: businessLimits,
    });
  });

  test('a grant with an end in the past, or revoked, has ended', () => {
    const lapsed = subscription({ kind: 'COMPLIMENTARY', currentPeriodEnd: past });
    expect(resolveAccess(input({ account: lapsed }), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: past,
    });
    const revokedAt = new Date('2027-06-14T00:00:00Z');
    const revoked = subscription({
      kind: 'COMPLIMENTARY',
      status: 'EXPIRED',
      currentPeriodEnd: null,
      endedAt: revokedAt,
    });
    expect(resolveAccess(input({ account: revoked }), now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'SUBSCRIPTION_ENDED',
      endedAt: revokedAt,
    });
  });

  test('a pending (unpaid) subscription grants nothing', () => {
    const pending = subscription({ status: 'PENDING' });
    expect(resolveAccess(input({ account: pending }), now).reason).toBe('TRIAL_ENDED');
  });

  test('no trial and no plan: read-only with nothing allowed', () => {
    expect(resolveAccess({ trial: null, account: null }, now)).toMatchObject({
      state: 'READ_ONLY',
      reason: 'NONE',
      endedAt: null,
      limits: { activeCollections: 0, storageBytes: 0n, guestLinks: 0 },
    });
  });
});

describe('a collection', () => {
  const pack: PackSource = {
    storageBytes: 10n * GiB,
    guestLinks: 10,
    windowEndsAt: future,
    retentionEndsAt: new Date('2028-06-01T00:00:00Z'),
  };
  const packLimits = {
    activeCollections: null,
    storageBytes: null,
    collectionStorageBytes: 10n * GiB,
    guestLinks: 10,
    windowDays: null,
    retentionDays: null,
  };

  test('an account collection takes the account state and limits', () => {
    const result = resolveAccess(
      input({ trial: liveTrial, collection: { entitlement: 'ACCOUNT', pack: null } }),
      now,
    );
    expect(result).toMatchObject({ state: 'ACTIVE', reason: 'TRIAL', limits: trialLimits });
  });

  test('a pack collection is active before its window ends, whatever the account', () => {
    expect(resolveAccess(input({ collection: { entitlement: 'PACK', pack } }), now)).toEqual({
      state: 'ACTIVE',
      reason: 'PACK',
      endsAt: future,
      graceEndsAt: null,
      endedAt: null,
      limits: packLimits,
    });
  });

  test('between the window and the retention end it is closed to guests', () => {
    const closed = { ...pack, windowEndsAt: past };
    expect(
      resolveAccess(input({ collection: { entitlement: 'PACK', pack: closed } }), now),
    ).toMatchObject({
      state: 'COLLECTING_CLOSED',
      reason: 'PACK_WINDOW_ENDED',
      endsAt: pack.retentionEndsAt,
      endedAt: null,
    });
  });

  test('after the retention end it is read-only from that end', () => {
    const over = {
      ...pack,
      windowEndsAt: new Date('2027-05-01T00:00:00Z'),
      retentionEndsAt: past,
    };
    expect(
      resolveAccess(
        input({ account: subscription(), collection: { entitlement: 'PACK', pack: over } }),
        now,
      ),
    ).toMatchObject({
      state: 'READ_ONLY',
      reason: 'PACK_RETENTION_ENDED',
      endsAt: null,
      endedAt: past,
    });
  });
});
