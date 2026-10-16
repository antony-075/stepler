import { Inject, Injectable } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import type { BillingInterval, BillingOffer, Payment } from '../generated/prisma/client.js';
import { FISCAL_RECEIPTS, type FiscalReceipts } from './fiscal/fiscal-receipts.js';
import { readSnapshot, snapshotTitle } from './offer-snapshot.js';
import {
  type CheckoutForm,
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './provider/payment-provider.js';

export interface FormUser {
  email: string;
  locale: 'uk' | 'en';
}

/** A recurring checkout: LiqPay charges now and then every `interval` from `startAt`. */
export interface RecurringTerms {
  interval: Extract<BillingInterval, 'MONTH' | 'YEAR'>;
  startAt: Date;
}

/**
 * LiqPay's signed checkout form for one of our payments (ADR 0018). Everything in it comes from
 * the payment row: the amount, the currency and the title are the server's, never the client's.
 */
@Injectable()
export class CheckoutForms {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(FISCAL_RECEIPTS) private readonly fiscal: FiscalReceipts,
  ) {}

  /** Payments are on: else `503`, before anything is written (rule 18). */
  get enabled(): boolean {
    return this.env.BILLING_PROVIDER === 'liqpay';
  }

  /** How long a checkout stays payable (also LiqPay's `expired_date`). */
  get pendingTtlMinutes(): number {
    return this.env.BILLING_PENDING_TTL_MINUTES;
  }

  formFor(
    row: Payment,
    offer: BillingOffer,
    user: FormUser,
    recurring?: RecurringTerms,
  ): CheckoutForm {
    const fiscal = this.fiscal.rroInfo(offer, row.amountMinor, row.currency, user.email);
    return this.provider.checkoutForm({
      orderId: row.providerOrderId,
      action: recurring === undefined ? 'pay' : 'subscribe',
      amountMinor: row.amountMinor,
      currency: row.currency,
      description: `Stepler: ${snapshotTitle(readSnapshot(row.offerSnapshot), user.locale)}`,
      language: user.locale,
      resultUrl: `${this.env.APP_ORIGIN}/app/billing/return?payment=${row.id}`,
      serverUrl: this.env.BILLING_CALLBACK_URL ?? null,
      expiresAt: row.expiresAt,
      ...(recurring === undefined
        ? {}
        : {
            subscription: {
              startAt: recurring.startAt,
              periodicity: recurring.interval === 'YEAR' ? 'year' : 'month',
            },
          }),
      ...(fiscal === undefined ? {} : { fiscal }),
    });
  }
}
