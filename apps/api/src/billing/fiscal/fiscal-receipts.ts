import type { Currency } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import { formatMinor } from '../domain/money.js';
import type { RroInfo } from '../provider/payment-provider.js';

/**
 * Fiscal receipts (plan [P14], `BILLING_FISCAL_MODE`). Whether Stepler must issue them is the
 * accountant's answer ([Q1]); production with live keys refuses to start until it is given.
 */
export const FISCAL_RECEIPTS = Symbol('FISCAL_RECEIPTS');

export interface FiscalReceipts {
  /** `undefined` = no receipt lines on this checkout. */
  rroInfo(
    offer: { rroItemId: string | null },
    priceMinor: number,
    currency: Currency,
    email: string,
  ): RroInfo | undefined;
}

/** `none`: LiqPay's own payment receipt only. */
export class NoFiscalReceipts implements FiscalReceipts {
  rroInfo(): undefined {
    return undefined;
  }
}

/**
 * `liqpay_rro`: LiqPay's ПРРО issues the receipt from `rro_info`. Each offer needs the item id
 * registered in the LiqPay cabinet; an offer without one cannot be sold (`409 OFFER_UNAVAILABLE`).
 * Fail closed on USD and EUR (ADR 0018, B2, 2026-10-16): a Ukrainian fiscal receipt is in
 * hryvnias, and how LiqPay's ПРРО books a currency payment is not confirmed, so with receipts on
 * only UAH is sold until the accountant and LiqPay confirm it.
 */
export class LiqPayRroReceipts implements FiscalReceipts {
  rroInfo(
    offer: { rroItemId: string | null },
    priceMinor: number,
    currency: Currency,
    email: string,
  ): RroInfo {
    if (offer.rroItemId === null || currency !== 'UAH') {
      throw new AppError('OFFER_UNAVAILABLE', 409);
    }
    const price = formatMinor(priceMinor);
    return {
      items: [{ id: offer.rroItemId, amount: 1, price, cost: price }],
      delivery_emails: [email],
    };
  }
}
