import type { PaymentStatus, SubscriptionSource, SubscriptionStatus } from '@stepler/contracts';
import type { PaymentFilters, SubscriptionFilters } from '../api/billing';
import { PAYMENT_STATUSES, SUBSCRIPTION_STATUSES } from './billing-labels';

type SearchParams = Record<string, string | string[] | undefined>;

const TRUE = 'true';
const SOURCES: readonly SubscriptionSource[] = ['LIQPAY', 'COMPLIMENTARY'];

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The payments list's filters from the URL; unknown values are dropped (the API checks too). */
export function paymentFiltersOf(params: SearchParams): PaymentFilters {
  const filters: PaymentFilters = {};
  const status = one(params, 'status');
  if (status !== undefined && (PAYMENT_STATUSES as string[]).includes(status)) {
    filters.status = status as PaymentStatus;
  }
  const email = one(params, 'email');
  if (email !== undefined) filters.email = email;
  if (one(params, 'needsReview') === TRUE) filters.needsReview = TRUE;
  if (one(params, 'mismatch') === TRUE) filters.mismatch = TRUE;
  return filters;
}

export function subscriptionFiltersOf(params: SearchParams): SubscriptionFilters {
  const filters: SubscriptionFilters = {};
  const status = one(params, 'status');
  if (status !== undefined && (SUBSCRIPTION_STATUSES as string[]).includes(status)) {
    filters.status = status as SubscriptionStatus;
  }
  const source = one(params, 'source');
  if (source !== undefined && (SOURCES as string[]).includes(source)) {
    filters.source = source as SubscriptionSource;
  }
  const email = one(params, 'email');
  if (email !== undefined) filters.email = email;
  if (one(params, 'needsCheck') === TRUE) filters.needsCheck = TRUE;
  return filters;
}
