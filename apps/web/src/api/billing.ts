import {
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutResponseSchema,
  type OfferList,
  offerListSchema,
  type PaymentDto,
  paymentDtoSchema,
  type PaymentList,
  paymentListSchema,
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

/** The return page polls this; the API asks LiqPay while the payment is pending. */
export const fetchPayment = (id: string): Promise<PaymentDto> =>
  apiRequest(`/billing/payments/${encodeURIComponent(id)}`, { schema: paymentDtoSchema });

export const listPayments = (): Promise<PaymentList> =>
  apiRequest('/billing/payments?limit=50', { schema: paymentListSchema });
