import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Payment, Prisma } from '../generated/prisma/client.js';
import { type GrantResult, PackGrants } from './pack-grants.js';
import { SubscriptionTransitions } from './subscription-transitions.js';
import type { ProviderEvent } from './provider/payment-provider.js';

type Db = Prisma.TransactionClient;

export type TransitionOutcome = 'applied' | 'noop' | 'mismatch' | 'review';

/**
 * The payment state machine (ADR 0018, plan Task 12): the only writer of `Payment.status` after
 * checkout. A callback and a `status` answer go through the same function, under the same locks,
 * so replays, duplicates and reordering converge:
 * - `PENDING | FAILED | EXPIRED` + success → `SUCCEEDED` and the grant (money was taken, so a late
 *   success is honoured); a grant that would duplicate is `needsReview`, nothing granted twice;
 * - `PENDING` + failure → `FAILED`; a final state never regresses;
 * - `SUCCEEDED` + reversal → `REVERSED`, the pack ends ([Q4]);
 * - another amount or currency than the snapshot → `mismatch`, nothing granted.
 * The caller holds the locks [C9]: the owner, then the collection, then this payment.
 */
@Injectable()
export class PaymentTransitions {
  private readonly logger = new Logger(PaymentTransitions.name);

  constructor(
    private readonly grants: PackGrants,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionTransitions,
  ) {}

  async apply(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: 'callback' | 'status',
    now = new Date(),
  ): Promise<TransitionOutcome> {
    // LiqPay reports our own /ops refund as `reversed` too (on the callback and in `status`):
    // that is not a chargeback and must not end what was bought ([Q4]); `RefundsService` owns it.
    if (ev.outcome === 'REVERSED' && (await refundExplains(tx, payment, ev))) {
      this.logger.log({ msg: 'billing.payment.refund_reported', paymentId: payment.id, source });
      return 'noop';
    }
    // Subscription payments (the first one, renewals on its order, upgrades) have their own
    // machine; it writes their `Payment.status` the same way.
    if (payment.kind !== 'PACK' && payment.kind !== 'PACK_EXTENSION') {
      return this.subscriptions.apply(tx, payment, ev, source, now);
    }
    if (ev.outcome === 'SUCCEEDED' || ev.outcome === 'REVERSED') {
      if (ev.amountMinor !== payment.amountMinor || ev.currency !== payment.currency) {
        if (!payment.mismatch) {
          await tx.payment.update({ where: { id: payment.id }, data: { mismatch: true } });
        }
        this.logger.warn({ msg: 'billing.payment.mismatch', paymentId: payment.id, source });
        return 'mismatch';
      }
    }
    switch (ev.outcome) {
      case 'SUCCEEDED':
        return this.succeed(tx, payment, ev, source, now);
      case 'FAILED':
        return this.fail(tx, payment, ev, source);
      case 'REVERSED':
        return this.reverse(tx, payment, source, now);
      default:
        return 'noop';
    }
  }

  /**
   * A checkout nobody paid: `PENDING` past its TTL, and the provider has no success for it. A
   * success that arrives later is still honoured (`EXPIRED` + success → `SUCCEEDED`).
   */
  async expire(tx: Db, payment: Payment): Promise<TransitionOutcome> {
    if (payment.status !== 'PENDING') return 'noop';
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } });
    if (payment.kind === 'SUBSCRIPTION' && payment.subscriptionId !== null) {
      await this.subscriptions.checkoutExpired(tx, payment.subscriptionId);
    }
    return 'applied';
  }

  private async succeed(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: string,
    now: Date,
  ): Promise<TransitionOutcome> {
    if (
      payment.status !== 'PENDING' &&
      payment.status !== 'FAILED' &&
      payment.status !== 'EXPIRED'
    ) {
      return 'noop';
    }
    const paidAt = ev.occurredAt ?? now;
    const grant: GrantResult =
      payment.kind === 'PACK'
        ? await this.grants.applyPack(tx, payment, paidAt)
        : await this.grants.applyExtension(tx, payment, paidAt);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        paidAt,
        errCode: null,
        needsReview: grant === 'review',
        ...(ev.providerPaymentId === null ? {} : { providerPaymentId: ev.providerPaymentId }),
      },
    });
    await this.record(tx, payment, 'billing.payment_succeeded', {
      source,
      review: grant === 'review',
    });
    this.logger.log({ msg: 'billing.payment.succeeded', paymentId: payment.id, source, grant });
    return grant === 'review' ? 'review' : 'applied';
  }

  private async fail(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: string,
  ): Promise<TransitionOutcome> {
    if (payment.status !== 'PENDING') return 'noop';
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: ev.occurredAt ?? new Date(), errCode: ev.errCode },
    });
    await this.record(tx, payment, 'billing.payment_failed', { source, errCode: ev.errCode });
    return 'applied';
  }

  private async reverse(
    tx: Db,
    payment: Payment,
    source: string,
    now: Date,
  ): Promise<TransitionOutcome> {
    if (payment.status !== 'SUCCEEDED') return 'noop';
    const revoked = await this.grants.revoke(tx, payment, now);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'REVERSED', needsReview: payment.needsReview || revoked === 'review' },
    });
    await this.record(tx, payment, 'billing.payment_reversed', { source });
    return revoked === 'review' ? 'review' : 'applied';
  }

  private record(
    tx: Db,
    payment: Payment,
    action: 'billing.payment_succeeded' | 'billing.payment_failed' | 'billing.payment_reversed',
    metadata: Record<string, string | boolean | null>,
  ): Promise<void> {
    return this.audit.record(tx, {
      ...(payment.collectionId === null ? {} : { collectionId: payment.collectionId }),
      actor: 'system',
      action,
      targetType: 'payment',
      targetId: payment.id,
      metadata: { kind: payment.kind, ...metadata },
    });
  }
}

/**
 * A `reversed` report caused by our refund: LiqPay names the action `refund`, or a refund is in
 * flight or done on this payment (or, for a subscription's order, on any charge of it).
 */
async function refundExplains(tx: Db, payment: Payment, ev: ProviderEvent): Promise<boolean> {
  if (ev.action === 'refund') return true;
  const count = await tx.refund.count({
    where: {
      status: { in: ['PENDING', 'SUCCEEDED'] },
      payment:
        payment.subscriptionId === null
          ? { id: payment.id }
          : { subscriptionId: payment.subscriptionId },
    },
  });
  return count > 0;
}
