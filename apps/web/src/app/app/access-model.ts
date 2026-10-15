import type { Access, Collection } from '@stepler/contracts';

const DAY_MS = 24 * 3600_000;
/** The trial reminder shows in the last days only, so a new account is not nagged (ADR 0018). */
export const TRIAL_REMINDER_DAYS = 3;

/**
 * Whole days left, rounded down, as «Тариф і оплата»'s countdown counts them (5 days 12 hours →
 * «5 днів»; under a day → 0, «останній день» / «сьогодні»); never below 0. The one rule for every
 * «залишилось N днів» in the app (the dashboard link, the banner, the plan card).
 */
export function daysLeft(endsAt: string, now: Date): number {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - now.getTime()) / DAY_MS));
}

/** What the account banner above every admin page says, if anything. */
export type AccountBanner =
  | { kind: 'trial'; days: number }
  | { kind: 'grace'; until: string }
  | { kind: 'readOnly'; reason: 'TRIAL_ENDED' | 'SUBSCRIPTION_ENDED' | 'NONE' }
  | null;

export function accountBanner(access: Access, now: Date): AccountBanner {
  if (access.state === 'GRACE') return { kind: 'grace', until: access.endsAt ?? '' };
  if (access.state === 'READ_ONLY') {
    const reason =
      access.reason === 'TRIAL_ENDED' || access.reason === 'SUBSCRIPTION_ENDED'
        ? access.reason
        : 'NONE';
    return { kind: 'readOnly', reason };
  }
  if (access.reason === 'TRIAL' && access.endsAt !== null) {
    const days = daysLeft(access.endsAt, now);
    return days <= TRIAL_REMINDER_DAYS ? { kind: 'trial', days } : null;
  }
  return null;
}

/** The id of the sentence that explains disabled write actions (their `aria-describedby`). */
export const ACCOUNT_ACCESS_REASON_ID = 'account-access-reason';
export const COLLECTION_ACCESS_REASON_ID = 'collection-access-reason';

/**
 * Whether the admin may change this collection (ADR 0018 [P2]): not while it is read-only. A pack
 * collection closed to guests (`COLLECTING_CLOSED`) stays editable.
 */
export function writeLock(collection: Pick<Collection, 'access' | 'entitlement'>): {
  locked: boolean;
  /** Where the reason is written: the account banner, or the collection's own notice. */
  describedBy: string | undefined;
} {
  if (collection.access.state !== 'READ_ONLY') return { locked: false, describedBy: undefined };
  return {
    locked: true,
    describedBy:
      collection.entitlement === 'PACK' ? COLLECTION_ACCESS_REASON_ID : ACCOUNT_ACCESS_REASON_ID,
  };
}
