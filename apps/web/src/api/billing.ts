import {
  type BillingSummary,
  billingSummarySchema,
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutResponseSchema,
  type OfferList,
  offerListSchema,
  type PaymentDto,
  paymentDtoSchema,
  type PaymentList,
  paymentListSchema,
  type PlanChangePreview,
  planChangePreviewSchema,
  type SubscriptionDto,
  subscriptionDtoSchema,
} from '@stepler/contracts';
import { apiRequest } from './client';

/** Billing reads (ADR 0018); everything under it is refetched after a payment settles. */
export const BILLING_KEY = ['billing'] as const;
export const offersKey = (locale: string) => ['billing', 'offers', locale] as const;
export const PAYMENTS_KEY = ['billing', 'payments'] as const;
export const paymentKey = (id: string) => ['billing', 'payment', id] as const;

export const fetchOffers = (locale: string): Promise<OfferList> =>
  apiRequest(`/billing/offers?locale=${encodeURIComponent(locale)}`, { schema: offerListSchema });

/** The server prices it; the answer carries LiqPay's signed form, never an amount we sent. */
export const createCheckout = (body: CheckoutRequest): Promise<CheckoutResponse> =>
  apiRequest('/billing/checkouts', { method: 'POST', body, schema: checkoutResponseSchema });

/** The same pending order again, freshly signed (after a declined card). */
export const resumeCheckout = (paymentId: string): Promise<CheckoutResponse> =>
  apiRequest(`/billing/payments/${encodeURIComponent(paymentId)}/checkout`, {
    method: 'POST',
    schema: checkoutResponseSchema,
  });

/** The return page polls this; the API asks LiqPay while the payment is pending. */
export const fetchPayment = (id: string): Promise<PaymentDto> =>
  apiRequest(`/billing/payments/${encodeURIComponent(id)}`, { schema: paymentDtoSchema });

/** One page of the account's payments, newest first; `cursor` from the previous page. */
export const listPayments = (cursor?: string): Promise<PaymentList> =>
  apiRequest(
    `/billing/payments?limit=${PAYMENTS_PAGE}${
      cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`
    }`,
    { schema: paymentListSchema },
  );

export const PAYMENTS_PAGE = 50;

export const SUMMARY_KEY = ['billing', 'summary'] as const;
export const changePreviewKey = (priceId: string) =>
  ['billing', 'change-preview', priceId] as const;

/** «Тариф і оплата»: access, the trial, the live plan and the account's usage. */
export const fetchSummary = (): Promise<BillingSummary> =>
  apiRequest('/billing/summary', { schema: billingSummarySchema });

/** What a plan change would cost and when it applies; the server decides, this only shows it. */
export const fetchChangePreview = (priceId: string): Promise<PlanChangePreview> =>
  apiRequest(`/billing/subscription/change-preview?priceId=${encodeURIComponent(priceId)}`, {
    schema: planChangePreviewSchema,
  });

export const cancelSubscription = (): Promise<SubscriptionDto> =>
  apiRequest('/billing/subscription/cancel', { method: 'POST', schema: subscriptionDtoSchema });

/** A cancelled plan again: a new LiqPay checkout (the card is confirmed again). */
export const resumeSubscription = (termsVersion: string): Promise<CheckoutResponse> =>
  apiRequest('/billing/subscription/resume', {
    method: 'POST',
    body: { autoRenewConsent: true, termsVersion },
    schema: checkoutResponseSchema,
  });

export const cancelPendingChange = (): Promise<SubscriptionDto> =>
  apiRequest('/billing/subscription/pending-change', {
    method: 'DELETE',
    schema: subscriptionDtoSchema,
  });
