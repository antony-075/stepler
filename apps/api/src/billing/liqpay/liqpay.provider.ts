import { Logger } from '@nestjs/common';
import { AppError } from '../../errors/app-error.js';
import type { Currency } from '../../generated/prisma/client.js';
import { formatMinor, parseAmountToMinor } from '../domain/money.js';
import type {
  CheckoutForm,
  CheckoutInput,
  PaymentProvider,
  ProviderEvent,
  ProviderRefundResult,
} from '../provider/payment-provider.js';
import { decodeData, encodeData, liqpaySign, signatureMatches } from './liqpay-signature.js';
import { mapLiqPayStatus } from './liqpay-status.js';

/** The browser posts the signed form here (LiqPay checkout page, version 7). */
export const LIQPAY_CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout';
export const LIQPAY_API_VERSION = 7;
const REQUEST_TIMEOUT_MS = 10_000;

export interface LiqPayConfig {
  publicKey: string;
  privateKey: string;
  /** `LIQPAY_API_BASE`: `https://www.liqpay.ua`, or a local stub in tests. */
  apiBase: string;
  timeoutMs?: number;
}

/**
 * The fields kept from a callback or `status` answer (plan "Deliberate choices"). Names, phone,
 * IP, card mask and card token are dropped before anything is stored or logged.
 */
const SAFE_FIELDS = [
  'action',
  'status',
  'order_id',
  'liqpay_order_id',
  'payment_id',
  'amount',
  'currency',
  'err_code',
  'err_description',
  'create_date',
  'end_date',
  'paytype',
  'is_3ds',
  'refund_amount',
  'version',
] as const;

/** How the status API answers for an order it does not know (to be confirmed by spike S1). */
const NOT_FOUND_CODES = new Set(['payment_not_found', 'order_not_found']);

const ACTIONS = new Set(['pay', 'subscribe', 'regular', 'refund']);

/** `YYYY-MM-DD HH:mm:ss` in UTC, LiqPay's `expired_date` / `subscribe_date_start` format. */
export function liqpayDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function safePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SAFE_FIELDS) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  return out;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0
    ? value
    : typeof value === 'number'
      ? String(value)
      : null;

function amountOf(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  try {
    return parseAmountToMinor(value);
  } catch {
    return null;
  }
}

function dateOf(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value) : null;
}

/**
 * LiqPay behind the payment provider port (ADR 0018). No SDK: the SDKs sign with SHA-1 for
 * version 3; this signs version 7 with SHA3-256 on `node:crypto`. No retries inside: the callers
 * decide (the return page and the reconciliation job ask again later).
 */
export class LiqPayProvider implements PaymentProvider {
  private readonly logger = new Logger(LiqPayProvider.name);

  constructor(private readonly config: LiqPayConfig) {}

  checkoutForm(input: CheckoutInput): CheckoutForm {
    const params: Record<string, unknown> = {
      public_key: this.config.publicKey,
      version: LIQPAY_API_VERSION,
      action: input.action,
      amount: formatMinor(input.amountMinor),
      currency: input.currency,
      description: input.description,
      order_id: input.orderId,
      language: input.language,
      result_url: input.resultUrl,
      expired_date: liqpayDate(input.expiresAt),
      ...(input.serverUrl === null ? {} : { server_url: input.serverUrl }),
      ...(input.subscription === undefined
        ? {}
        : {
            subscribe: 1,
            subscribe_date_start: liqpayDate(input.subscription.startAt),
            subscribe_periodicity: input.subscription.periodicity,
          }),
      ...(input.fiscal === undefined ? {} : { rro_info: input.fiscal }),
    };
    return { action: LIQPAY_CHECKOUT_URL, fields: this.sign(params) };
  }

  verifyCallback(body: { data: string; signature: string }): ProviderEvent {
    if (!signatureMatches(this.config.privateKey, body.data, body.signature)) {
      throw new AppError('BILLING_SIGNATURE_INVALID', 400);
    }
    const decoded = decodeData(body.data);
    const orderId = decoded === null ? null : text(decoded.order_id);
    if (decoded === null || orderId === null) {
      throw new AppError('BILLING_SIGNATURE_INVALID', 400, { detail: 'Malformed callback data' });
    }
    return this.toEvent(decoded, orderId);
  }

  eventFromPayload(orderId: string, payload: Record<string, unknown>): ProviderEvent {
    return this.toEvent(payload, orderId);
  }

  async status(orderId: string): Promise<ProviderEvent | null> {
    const answer = await this.request({ action: 'status', order_id: orderId });
    if (text(answer.order_id) === null) {
      const code = text(answer.err_code);
      if (code !== null && NOT_FOUND_CODES.has(code)) return null;
      this.logger.warn({ msg: 'billing.provider.status_error', errCode: code });
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    return this.toEvent(answer, orderId);
  }

  async refund(orderId: string, amountMinor: number): Promise<ProviderRefundResult> {
    const answer = await this.request({
      action: 'refund',
      order_id: orderId,
      amount: formatMinor(amountMinor),
    });
    const rawStatus = text(answer.status) ?? text(answer.result) ?? 'unknown';
    if (rawStatus === 'reversed' || rawStatus === 'success') {
      return { outcome: 'SUCCEEDED', rawStatus };
    }
    if (rawStatus === 'error' || rawStatus === 'failure') return { outcome: 'FAILED', rawStatus };
    return { outcome: 'PENDING', rawStatus };
  }

  async charges(orderId: string, from: Date, to: Date): Promise<ProviderEvent[]> {
    const answer = await this.request({
      action: 'reports',
      date_from: String(from.getTime()),
      date_to: String(to.getTime()),
    });
    if (!Array.isArray(answer.data)) {
      this.logger.warn({ msg: 'billing.provider.reports_error', errCode: text(answer.err_code) });
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    return (answer.data as unknown[])
      .filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' &&
          row !== null &&
          text((row as Record<string, unknown>).order_id) === orderId,
      )
      .map((row) => this.toEvent(row, orderId))
      .sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0));
  }

  async unsubscribe(orderId: string): Promise<ProviderEvent> {
    return this.toEvent(await this.request({ action: 'unsubscribe', order_id: orderId }), orderId);
  }

  async updateSubscription(
    orderId: string,
    amountMinor: number,
    currency: Currency,
    description: string,
  ): Promise<ProviderEvent> {
    const answer = await this.request({
      action: 'subscribe_update',
      order_id: orderId,
      amount: formatMinor(amountMinor),
      currency,
      description,
    });
    return this.toEvent(answer, orderId);
  }

  private sign(params: Record<string, unknown>): { data: string; signature: string } {
    const data = encodeData(params);
    return { data, signature: liqpaySign(this.config.privateKey, data) };
  }

  /** One signed server-to-server call; any transport or HTTP failure is a `503`. */
  private async request(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fields = this.sign({
      public_key: this.config.publicKey,
      version: LIQPAY_API_VERSION,
      ...params,
    });
    const action = String(params.action);
    let res: Response;
    try {
      res = await fetch(`${this.config.apiBase}/api/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      this.logger.warn({ msg: 'billing.provider.unreachable', action });
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true, cause });
    }
    if (!res.ok) {
      this.logger.warn({ msg: 'billing.provider.http_error', action, httpStatus: res.status });
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (cause) {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true, cause });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    return body as Record<string, unknown>;
  }

  private toEvent(raw: Record<string, unknown>, orderId: string): ProviderEvent {
    const rawStatus = text(raw.status) ?? 'unknown';
    const { outcome, known } = mapLiqPayStatus(rawStatus);
    if (!known) this.logger.warn({ msg: 'billing.provider.unknown_status', rawStatus });
    const action = text(raw.action);
    return {
      orderId,
      providerPaymentId: text(raw.payment_id),
      providerOrderId: text(raw.liqpay_order_id),
      action:
        action !== null && ACTIONS.has(action) ? (action as ProviderEvent['action']) : 'other',
      outcome,
      rawStatus,
      amountMinor: amountOf(raw.amount),
      currency: text(raw.currency),
      errCode: text(raw.err_code),
      occurredAt: dateOf(raw.end_date) ?? dateOf(raw.create_date),
      safePayload: safePayload(raw),
    };
  }
}
