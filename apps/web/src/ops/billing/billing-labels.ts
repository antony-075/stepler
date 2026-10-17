import type { PaymentStatus, SubscriptionStatus } from '@stepler/contracts';

/** The one colour of a payment row: its status (always with the word beside it). */
export const PAYMENT_BADGE = {
  PENDING: 'neutral',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REVERSED: 'danger',
  REFUNDED: 'warning',
  PARTIALLY_REFUNDED: 'warning',
} as const satisfies Record<PaymentStatus, string>;

export const SUBSCRIPTION_BADGE = {
  PENDING: 'neutral',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELED: 'neutral',
  EXPIRED: 'danger',
} as const satisfies Record<SubscriptionStatus, string>;

export const PAYMENT_STATUSES = Object.keys(PAYMENT_BADGE) as PaymentStatus[];
export const SUBSCRIPTION_STATUSES = Object.keys(SUBSCRIPTION_BADGE) as SubscriptionStatus[];

/** Dates in the console: Kyiv time, the operator's working zone. */
export const KYIV = 'Europe/Kyiv';
