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
}
