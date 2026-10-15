import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Payment } from '../generated/prisma/client.js';
import { PaymentEvents } from './payment-events.service.js';
import { PaymentTransitions } from './payment-transitions.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderEvent,
} from './provider/payment-provider.js';

/** A fresh checkout is left to the payer for this long before LiqPay is asked. */
export const FIRST_CHECK_AFTER_MS = 30_000;
/** At most one `status` call per payment per this interval (the return page polls every 3 s). */
export const CHECK_INTERVAL_MS = 15_000;
/** A pending payment past its TTL by this much, with no success at LiqPay, expires. */
export const EXPIRE_GRACE_MS = 15 * 60_000;
/** A subscription is asked at most once per this interval (plan Task 16: hourly). */
export const SUBSCRIPTION_CHECK_INTERVAL_MS = 60 * 60_000;

/** The archive is read from this long before the period end (LiqPay may charge early). */
export const RENEWAL_LOOKBACK_MS = 2 * 24 * 60 * 60_000;

/** What the renewal check found for a period that ended (see `refreshSubscription`). */
export type RenewalCheck =
  'RENEWED' | 'FAILED' | 'NONE' | 'NOT_EXPECTED' | 'UNAVAILABLE' | 'SKIPPED';

/**
 * Settles open payments through LiqPay's `status` API (ADR 0018 [P7]): the return page's poll and
 * the worker's `billing.reconcile` job both call it, and the answer goes through the same
 * transition as a callback. So a payment settles without a callback (local development, a lost
 * callback); this is a real provider call, not a simulation (rule 18). Provider errors never
 * reach the caller: the payment stays as it is and is asked again later.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PaymentEvents,
    private readonly transitions: PaymentTransitions,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** The payment, refreshed from LiqPay when it is pending and due for a check. */
  async refreshPayment(paymentId: string, now = new Date()): Promise<Payment> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== 'PENDING') return payment;
    if (payment.createdAt.getTime() > now.getTime() - FIRST_CHECK_AFTER_MS) return payment;
    const ev = await this.ask(payment, now);
    if (ev === undefined || ev === null) return this.reload(payment.id);
    return (await this.events.applyStatus(ev))?.payment ?? payment;
  }

  /**
   * The job's step for a pending payment past `expiresAt + 15 min`: a success at LiqPay is
   * applied; no order at LiqPay, or still nothing final, expires it. A provider error does not.
   */
  async settleStale(paymentId: string, now = new Date()): Promise<Payment> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== 'PENDING') return payment;
    const ev = await this.ask(payment, now, true);
    if (ev === undefined) return this.reload(payment.id);
    if (ev !== null && ev.outcome !== 'PENDING') {
      return (await this.events.applyStatus(ev))?.payment ?? payment;
    }
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.events.lockByOrder(tx, payment.providerOrderId);
      if (locked !== null) await this.transitions.expire(tx, locked);
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  }

  /**
   * Claims the check (`lastCheckedAt`, so concurrent polls make one call) and asks LiqPay.
   * `undefined` = not asked (not due, or the provider failed); `null` = LiqPay has no such order.
   */
  private async ask(
    payment: Payment,
    now: Date,
    force = false,
  ): Promise<ProviderEvent | null | undefined> {
    const due = new Date(now.getTime() - (force ? 0 : CHECK_INTERVAL_MS));
    const { count } = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: 'PENDING',
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: due } }],
      },
      data: { lastCheckedAt: now },
    });
    if (count === 0) return undefined;
    try {
      return await this.provider.status(payment.providerOrderId);
    } catch {
      this.logger.warn({ msg: 'billing.reconcile.provider_error', paymentId: payment.id });
      return undefined;
    }
  }

  private reload(id: string): Promise<Payment> {
    return this.prisma.payment.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Asks LiqPay about a subscription (plan Task 16, Review Focus 5) at most once per hour
   * (`force` skips that) and applies what it says through the same transitions as a callback:
   * 1. `status` on the subscription's order: `unsubscribed` cancels. It does **not** report
   *    recurring charges (owner check 2026-10-15: a daily sandbox plan still answered its first
   *    `subscribe` transaction a week later), so
   * 2. once the period has ended, the payments archive (`charges`) from two days before the
   *    period end: each `regular` charge on the order is applied, oldest first (idempotent by
   *    its `payment_id`): a success renews, a failure starts grace.
   * `renewal` says what the archive showed for the ended period: `RENEWED`, `FAILED` (an explicit
   * failure, nothing after it), `NONE` (LiqPay answered and shows no charge), `NOT_EXPECTED`
   * (LiqPay stopped charging the plan, or its period has not ended), `UNAVAILABLE` (LiqPay could
   * not be asked) or `SKIPPED` (not due). Only `FAILED` and `NONE` (and `NOT_EXPECTED` after the
   * end) may lead to grace or expiry; `UNAVAILABLE` keeps access and flags the plan
   * (`renewalUnverifiedSince`, «потребує перевірки» in /ops). `lastRefreshOk` = both answered.
   */
  async refreshSubscription(
    subscriptionId: string,
    now = new Date(),
    force = false,
  ): Promise<{
    answered: boolean;
    statusAnswered: boolean;
    event: ProviderEvent | null;
    renewal: RenewalCheck;
    /** Since when the plan had been unverified before this answer (then cleared). */
    unverifiedSince?: Date | null;
  }> {
    const due = new Date(now.getTime() - (force ? 0 : SUBSCRIPTION_CHECK_INTERVAL_MS));
    const { count } = await this.prisma.subscription.updateMany({
      where: {
        id: subscriptionId,
        source: 'LIQPAY',
        providerOrderId: { not: null },
        OR: [{ lastRefreshAt: null }, { lastRefreshAt: { lte: due } }],
      },
      data: { lastRefreshAt: now, lastRefreshOk: false },
    });
    if (count === 0) {
      return { answered: false, statusAnswered: false, event: null, renewal: 'SKIPPED' };
    }
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { providerOrderId: true, renewalUnverifiedSince: true },
    });
    const orderId = sub.providerOrderId ?? '';
    let ev: ProviderEvent | null;
    try {
      ev = await this.provider.status(orderId);
    } catch {
      this.logger.warn({ msg: 'billing.reconcile.provider_error', subscriptionId });
      await this.flagUnverified(subscriptionId, now);
      return { answered: false, statusAnswered: false, event: null, renewal: 'UNAVAILABLE' };
    }
    if (ev !== null && (ev.action === 'regular' || ev.outcome === 'UNSUBSCRIBED')) {
      await this.events.applyStatus(ev);
    }
    const renewal = await this.lookupRenewal(subscriptionId, orderId, now);
    if (renewal === 'UNAVAILABLE') {
      await this.flagUnverified(subscriptionId, now);
      return { answered: false, statusAnswered: true, event: ev, renewal };
    }
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { lastRefreshOk: true, renewalUnverifiedSince: null },
    });
    return {
      answered: true,
      statusAnswered: true,
      event: ev,
      renewal,
      unverifiedSince: sub.renewalUnverifiedSince,
    };
  }

  /** Step 2 of `refreshSubscription`: the archive's charges for the period that ended. */
  private async lookupRenewal(
    subscriptionId: string,
    orderId: string,
    now: Date,
  ): Promise<RenewalCheck> {
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { status: true, currentPeriodEnd: true, providerUnsubscribedAt: true },
    });
    const end = sub.currentPeriodEnd;
    if (
      end === null ||
      end.getTime() > now.getTime() ||
      sub.providerUnsubscribedAt !== null ||
      (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE')
    ) {
      return 'NOT_EXPECTED';
    }
    let charges: ProviderEvent[];
    try {
      charges = await this.provider.charges(
        orderId,
        new Date(end.getTime() - RENEWAL_LOOKBACK_MS),
        now,
      );
    } catch {
      this.logger.warn({ msg: 'billing.reconcile.archive_error', subscriptionId });
      return 'UNAVAILABLE';
    }
    let failed = false;
    for (const charge of charges) {
      if (charge.action !== 'regular') continue;
      if (charge.outcome === 'SUCCEEDED') failed = false;
      else if (charge.outcome === 'FAILED') failed = true;
      else continue;
      await this.events.applyStatus(charge);
    }
    const after = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { currentPeriodEnd: true },
    });
    if ((after.currentPeriodEnd?.getTime() ?? 0) > end.getTime()) return 'RENEWED';
    return failed ? 'FAILED' : 'NONE';
  }

  private async flagUnverified(subscriptionId: string, now: Date): Promise<void> {
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, renewalUnverifiedSince: null },
      data: { renewalUnverifiedSince: now },
    });
    if (count > 0) {
      this.logger.warn({ msg: 'billing.subscription.renewal_unverified', subscriptionId });
    }
  }
}
