import type { Currency } from '../../generated/prisma/client.js';

/**
 * The payment provider port (ADR 0018). `LiqPayProvider` is the only production adapter; a test
 * double exists only in tests (rule 18). Amounts cross this boundary as integer minor units.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Fiscal receipt lines (`rro_info`, plan [P14]); prices are LiqPay decimals. */
export interface RroInfo {
  items: { id: string; amount: number; price: string; cost: string }[];
  delivery_emails: string[];
}

export interface CheckoutInput {
  /** Our payment id, LiqPay's `order_id` [P8]. */
  orderId: string;
  action: 'pay' | 'subscribe';
  amountMinor: number;
  currency: Currency;
  description: string;
  language: 'uk' | 'en';
  resultUrl: string;
  /** `null` = no `server_url` (local development: LiqPay cannot reach localhost). */
  serverUrl: string | null;
  expiresAt: Date;
  subscription?: { startAt: Date; periodicity: 'month' | 'year' };
  fiscal?: RroInfo;
}

/** The browser posts `fields` to `action` (the only direct browser → provider step). */
export interface CheckoutForm {
  action: string;
  fields: { data: string; signature: string };
}

export type ProviderOutcome =
  'SUCCEEDED' | 'FAILED' | 'PENDING' | 'REVERSED' | 'SUBSCRIBED' | 'UNSUBSCRIBED';

/** A provider's word on one order, from a verified callback or a `status` answer. */
export interface ProviderEvent {
  orderId: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  action: 'pay' | 'subscribe' | 'regular' | 'refund' | 'other';
  outcome: ProviderOutcome;
  rawStatus: string;
  /** `null` when the amount is missing or not a two-decimal amount: treated as a mismatch. */
  amountMinor: number | null;
  currency: string | null;
  errCode: string | null;
  occurredAt: Date | null;
  /** Whitelisted fields only: no names, phone, IP, card mask or card token. */
  safePayload: Record<string, unknown>;
}

export interface ProviderRefundResult {
  outcome: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  rawStatus: string;
}

export interface PaymentProvider {
  checkoutForm(input: CheckoutInput): CheckoutForm;
  /** Throws `400 BILLING_SIGNATURE_INVALID` unless `signature` signs `data` with our key. */
  verifyCallback(body: { data: string; signature: string }): ProviderEvent;
  /** Rebuilds an event from a stored safe payload (a verified callback reapplied later). */
  eventFromPayload(orderId: string, payload: Record<string, unknown>): ProviderEvent;
  /** `null` = the provider has no such order. Provider trouble → `503 PAYMENT_PROVIDER_UNAVAILABLE`. */
  status(orderId: string): Promise<ProviderEvent | null>;
  refund(orderId: string, amountMinor: number): Promise<ProviderRefundResult>;
  unsubscribe(orderId: string): Promise<ProviderEvent>;
  updateSubscription(
    orderId: string,
    amountMinor: number,
    currency: Currency,
    description: string,
  ): Promise<ProviderEvent>;
}
