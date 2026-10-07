import type { AccessReason, AccessState } from '@stepler/contracts';
import { isActiveAt } from './periods.js';

/**
 * Access resolution (ADR 0018, plan [P1], [P2], [P5]): pure, so every boundary is tested here and
 * the database loader (`EntitlementResolver`) only collects the inputs.
 *
 * Account source priority: a live subscription or complimentary grant (at most one is live, a
 * partial unique index) → the trial → none. A pack collection is governed by its pack alone.
 */

/** `null` = the source does not bound it (a pack has no account-wide limits). */
export interface EntitlementLimits {
  activeCollections: number | null;
  storageBytes: bigint | null;
  collectionStorageBytes: bigint | null;
  guestLinks: number | null;
  windowDays: number | null;
  retentionDays: number | null;
}

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

/**
 * The account's newest non-pending subscription or grant, live or not (an ended one still says
 * when access ended). `currentPeriodEnd: null` = a grant without an end.
 */
export interface AccountSource {
  kind: 'SUBSCRIPTION' | 'COMPLIMENTARY';
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  /** Set when it was ended early (revoked, expired). */
  endedAt: Date | null;
  limits: EntitlementLimits;
}

export interface PackSource {
  storageBytes: bigint;
  guestLinks: number;
  windowEndsAt: Date;
  retentionEndsAt: Date;
}

export interface TrialSource {
  endsAt: Date;
  /** The live `TRIAL` offer's limits (a trial is not a purchase, so no snapshot). */
  limits: EntitlementLimits;
}

export interface AccessInput {
  trial: TrialSource | null;
  account: AccountSource | null;
  collection?: { entitlement: 'ACCOUNT' | 'PACK'; pack: PackSource | null };
}

export interface AccessResult {
  state: AccessState;
  reason: AccessReason;
  /** When the current state's source ends; `null` = open-ended or already ended. */
  endsAt: Date | null;
  graceEndsAt: Date | null;
  /** When paid (or trial) access ended, for `READ_ONLY`: the retention clock starts here [P5]. */
  endedAt: Date | null;
  limits: EntitlementLimits;
}

const NO_LIMITS: EntitlementLimits = {
  activeCollections: 0,
  storageBytes: 0n,
  collectionStorageBytes: 0n,
  guestLinks: 0,
  windowDays: null,
  retentionDays: null,
};

function result(
  state: AccessState,
  reason: AccessReason,
  limits: EntitlementLimits,
  times: { endsAt?: Date | null; graceEndsAt?: Date | null; endedAt?: Date | null } = {},
): AccessResult {
  return {
    state,
    reason,
    endsAt: times.endsAt ?? null,
    graceEndsAt: times.graceEndsAt ?? null,
    endedAt: times.endedAt ?? null,
    limits,
  };
}

/** The live account source's result, or the moment it ended (`null` = it granted nothing). */
function accountSource(
  source: AccountSource,
  now: Date,
): { live: AccessResult } | { endedAt: Date } | null {
  const { status, currentPeriodEnd, graceEndsAt, limits } = source;
  if (status === 'PENDING') return null;
  if (source.kind === 'COMPLIMENTARY') {
    if (status === 'ACTIVE' && isActiveAt(now, currentPeriodEnd)) {
      return { live: result('ACTIVE', 'COMPLIMENTARY', limits, { endsAt: currentPeriodEnd }) };
    }
    const ended = source.endedAt ?? currentPeriodEnd;
    return ended ? { endedAt: ended } : null;
  }
  if (status === 'ACTIVE' || (status === 'CANCELED' && isActiveAt(now, currentPeriodEnd))) {
    if (status === 'ACTIVE' || currentPeriodEnd !== null) {
      return { live: result('ACTIVE', 'SUBSCRIPTION', limits, { endsAt: currentPeriodEnd }) };
    }
  }
  if (status === 'PAST_DUE' && graceEndsAt !== null && isActiveAt(now, graceEndsAt)) {
    return {
      live: result('GRACE', 'SUBSCRIPTION_PAST_DUE', limits, { endsAt: graceEndsAt, graceEndsAt }),
    };
  }
  // Ended: paid access stopped at the period end (grace is not paid time).
  const ended = currentPeriodEnd ?? source.endedAt;
  return ended ? { endedAt: ended } : null;
}

function resolveAccount(input: AccessInput, now: Date): AccessResult {
  const { trial, account } = input;
  const fromAccount = account ? accountSource(account, now) : null;
  if (fromAccount && 'live' in fromAccount) return fromAccount.live;
  if (trial && isActiveAt(now, trial.endsAt)) {
    return result('ACTIVE', 'TRIAL', trial.limits, { endsAt: trial.endsAt });
  }
  // Nothing live: the latest ended source decides the reason and when access ended.
  if (account && fromAccount && (!trial || fromAccount.endedAt >= trial.endsAt)) {
    return result('READ_ONLY', 'SUBSCRIPTION_ENDED', account.limits, {
      endedAt: fromAccount.endedAt,
    });
  }
  if (trial) return result('READ_ONLY', 'TRIAL_ENDED', trial.limits, { endedAt: trial.endsAt });
  return result('READ_ONLY', 'NONE', NO_LIMITS);
}

function resolvePack(pack: PackSource, now: Date): AccessResult {
  const limits: EntitlementLimits = {
    activeCollections: null,
    storageBytes: null,
    collectionStorageBytes: pack.storageBytes,
    guestLinks: pack.guestLinks,
    windowDays: null,
    retentionDays: null,
  };
  if (isActiveAt(now, pack.windowEndsAt)) {
    return result('ACTIVE', 'PACK', limits, { endsAt: pack.windowEndsAt });
  }
  if (isActiveAt(now, pack.retentionEndsAt)) {
    return result('COLLECTING_CLOSED', 'PACK_WINDOW_ENDED', limits, {
      endsAt: pack.retentionEndsAt,
    });
  }
  return result('READ_ONLY', 'PACK_RETENTION_ENDED', limits, { endedAt: pack.retentionEndsAt });
}

/**
 * The account's access, or a collection's when `input.collection` is given: a pack collection's
 * is its pack's; an account collection's is the account's [P2].
 */
export function resolveAccess(input: AccessInput, now: Date): AccessResult {
  const collection = input.collection;
  if (collection?.entitlement === 'PACK' && collection.pack) {
    return resolvePack(collection.pack, now);
  }
  return resolveAccount(input, now);
}
