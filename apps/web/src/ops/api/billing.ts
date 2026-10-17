import {
  type GrantCreate,
  type OfferCreate,
  type OfferUpsert,
  type OperatorOffer,
  operatorOfferSchema,
  type OperatorPaymentDetail,
  operatorPaymentDetailSchema,
  type OperatorPaymentList,
  operatorPaymentListSchema,
  type OperatorSubscription,
  type OperatorSubscriptionList,
  operatorSubscriptionListSchema,
  type OperatorSubscriptionRefresh,
  operatorSubscriptionRefreshSchema,
  operatorSubscriptionSchema,
  type PaymentListQuery,
  type PriceDeactivate,
  type PriceSet,
  type RefundDto,
  refundDtoSchema,
  type OperatorSubscriptionListQuery,
  type OperatorBillingAccount,
  operatorBillingAccountSchema,
  type OperatorOfferList,
  operatorOfferListSchema,
  type SubscriptionDto,
  subscriptionDtoSchema,
} from '@stepler/contracts';
import { opsRequest } from './client';

/** Query keys of the billing section (ADR 0018); a grant or revoke invalidates `all`. */
export const billingKeys = {
  all: ['ops', 'billing'] as const,
  account: (email: string) => ['ops', 'billing', 'account', email] as const,
  offers: ['ops', 'billing', 'offers'] as const,
  payments: (filters: PaymentFilters) => ['ops', 'billing', 'payments', filters] as const,
  payment: (id: string) => ['ops', 'billing', 'payment', id] as const,
  subscriptions: (filters: SubscriptionFilters) =>
    ['ops', 'billing', 'subscriptions', filters] as const,
};

/** The list filters the URL carries (`limit` and `cursor` are the query's own). */
export type PaymentFilters = Omit<PaymentListQuery, 'cursor' | 'limit'>;
export type SubscriptionFilters = Omit<OperatorSubscriptionListQuery, 'cursor' | 'limit'>;

function queryString(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

const withSignal = (signal?: AbortSignal) => (signal === undefined ? {} : { signal });

export const fetchBillingAccount = (
  email: string,
  signal?: AbortSignal,
): Promise<OperatorBillingAccount> =>
  opsRequest(`/operator/billing/accounts?${new URLSearchParams({ email }).toString()}`, {
    schema: operatorBillingAccountSchema,
    ...(signal === undefined ? {} : { signal }),
  });

export const fetchOffers = (signal?: AbortSignal): Promise<OperatorOfferList> =>
  opsRequest('/operator/billing/offers', {
    schema: operatorOfferListSchema,
    ...(signal === undefined ? {} : { signal }),
  });

export const grantPlan = (body: GrantCreate): Promise<SubscriptionDto> =>
  opsRequest('/operator/billing/grants', { method: 'POST', body, schema: subscriptionDtoSchema });

export const revokeGrant = (id: string, reason: string): Promise<SubscriptionDto> =>
  opsRequest(`/operator/billing/grants/${id}/revoke`, {
    method: 'POST',
    body: { reason },
    schema: subscriptionDtoSchema,
  });

// ── offers and prices (plan Task 20) ───────────────────────────────────────────────────────

export const createOffer = (body: OfferCreate): Promise<OperatorOffer> =>
  opsRequest('/operator/billing/offers', { method: 'POST', body, schema: operatorOfferSchema });

export const updateOffer = (id: string, body: OfferUpsert): Promise<OperatorOffer> =>
  opsRequest(`/operator/billing/offers/${id}`, {
    method: 'PATCH',
    body,
    schema: operatorOfferSchema,
  });

export const setOfferActive = (
  id: string,
  active: boolean,
  reason: string,
): Promise<OperatorOffer> =>
  opsRequest(`/operator/billing/offers/${id}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
    body: { reason },
    schema: operatorOfferSchema,
  });

export const setOfferPrice = (id: string, body: PriceSet): Promise<OperatorOffer> =>
  opsRequest(`/operator/billing/offers/${id}/prices`, {
    method: 'PUT',
    body,
    schema: operatorOfferSchema,
  });

/** Stops selling one slot (a period in a currency); its row stays for history. */
export const deactivateOfferPrice = (id: string, body: PriceDeactivate): Promise<OperatorOffer> =>
  opsRequest(`/operator/billing/offers/${id}/prices/deactivate`, {
    method: 'POST',
    body,
    schema: operatorOfferSchema,
  });

// ── payments, refunds, subscriptions (plan Task 21) ────────────────────────────────────────

export const fetchPayments = (
  filters: PaymentFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<OperatorPaymentList> =>
  opsRequest(`/operator/billing/payments${queryString({ ...filters, cursor })}`, {
    schema: operatorPaymentListSchema,
    ...withSignal(signal),
  });

export const fetchPayment = (id: string, signal?: AbortSignal): Promise<OperatorPaymentDetail> =>
  opsRequest(`/operator/billing/payments/${id}`, {
    schema: operatorPaymentDetailSchema,
    ...withSignal(signal),
  });

/** One `idempotencyKey` per opened refund form: a retried click never refunds twice. */
export const refundPayment = (
  id: string,
  body: { amountMinor: number; reason: string },
  idempotencyKey: string,
): Promise<RefundDto> =>
  opsRequest(`/operator/billing/payments/${id}/refunds`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
    schema: refundDtoSchema,
  });

export const endPack = (collectionId: string, reason: string): Promise<undefined> =>
  opsRequest(`/operator/billing/packs/${collectionId}/end`, { method: 'POST', body: { reason } });

export const fetchSubscriptions = (
  filters: SubscriptionFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<OperatorSubscriptionList> =>
  opsRequest(`/operator/billing/subscriptions${queryString({ ...filters, cursor })}`, {
    schema: operatorSubscriptionListSchema,
    ...withSignal(signal),
  });

export const refreshSubscription = (id: string): Promise<OperatorSubscriptionRefresh> =>
  opsRequest(`/operator/billing/subscriptions/${id}/refresh`, {
    method: 'POST',
    schema: operatorSubscriptionRefreshSchema,
  });

export const endSubscription = (id: string, reason: string): Promise<OperatorSubscription> =>
  opsRequest(`/operator/billing/subscriptions/${id}/end`, {
    method: 'POST',
    body: { reason },
    schema: operatorSubscriptionSchema,
  });
