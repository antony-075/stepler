import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import type { Payment, Prisma, Subscription } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { addDays, addInterval, laterOf } from './domain/periods.js';
import { type OfferSnapshot, readSnapshot, snapshotOf } from './offer-snapshot.js';
import type { ProviderEvent } from './provider/payment-provider.js';

type Db = Prisma.TransactionClient;

export type SubscriptionOutcome = 'applied' | 'noop' | 'mismatch' | 'review';

/** A plan that holds the account's access (`Subscription_one_live_per_user`). */
const LIVE: Prisma.SubscriptionWhereInput = {
  OR: [{ status: { in: ['ACTIVE', 'PAST_DUE'] } }, { status: 'CANCELED', endedAt: null }],
};

/** What a payment may still become paid from: a declined or expired checkout can still settle. */
const PAYABLE = new Set(['PENDING', 'FAILED', 'EXPIRED']);

type BillingEnv = Pick<ApiEnv, 'BILLING_GRACE_DAYS'>;

/**
 * Subscription state from LiqPay's word (ADR 0018, plan Tasks 15–17). Called by
 * `PaymentTransitions` for a subscription payment's order, under the locks the caller holds
 * [C9] (the owner, then the payment); this locks the subscription last.
 *
 * Spike S1b (2026-10-08): LiqPay reports a paid `subscribe` checkout as status `subscribed`
 * (action `subscribe`, the charged amount, a `payment_id`), not `success`; recurring charges
 * arrive as action `regular` on the same `order_id`, each with its own `payment_id`, which is
 * what makes a renewal idempotent here.
 * - start: the first payment succeeds → `ACTIVE` for one interval from the charge (or from the
 *   end of the plan it continues: a resumed subscription, or a monthly ↔ yearly switch whose old
 *   subscription the reconcile job stopped at the period end, B14); a complimentary grant is
 *   replaced; a second paid plan is never stacked (`needsReview`, the worker unsubscribes it);
 * - renewal success → the period advances by one interval from its end, a scheduled change
 *   applies; after `EXPIRED` it starts again at the charge (the money was taken);
 * - renewal failure → `PAST_DUE` with `graceEndsAt = currentPeriodEnd + BILLING_GRACE_DAYS`,
 *   the «не вдалося списати» mail once per period;
 * - `unsubscribed` from LiqPay → `CANCELED`, access to the period end;
 * - an upgrade's prorated payment → the new limits at once, the new price from the next charge.
 */
@Injectable()
export class SubscriptionTransitions {
  private readonly logger = new Logger(SubscriptionTransitions.name);

  constructor(
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(API_ENV) private readonly env: BillingEnv,
  ) {}

  async apply(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: 'callback' | 'status',
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (payment.subscriptionId === null) return 'noop';
    const sub = await lockSubscription(tx, payment.subscriptionId);
    if (ev.action === 'regular') {
      // Recurring charges are keyed to the subscription's own order (its first payment).
      if (payment.kind !== 'SUBSCRIPTION') return 'noop';
      return ev.outcome === 'SUCCEEDED'
        ? this.renewed(tx, sub, ev, source, now)
        : ev.outcome === 'FAILED'
          ? this.renewalFailed(tx, sub, ev, source, now)
          : 'noop';
    }
    if (ev.outcome === 'UNSUBSCRIBED') return this.providerUnsubscribed(tx, sub, source, now);
    if (payment.kind === 'SUBSCRIPTION') return this.start(tx, payment, sub, ev, source, now);
    if (payment.kind === 'SUBSCRIPTION_CHANGE') {
      return this.upgradePaid(tx, payment, sub, ev, source, now);
    }
    return 'noop';
  }

  // ── the first payment ────────────────────────────────────────────────────────────────────

  private async start(
    tx: Db,
    payment: Payment,
    sub: Subscription,
    ev: ProviderEvent,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (ev.outcome === 'FAILED') return this.paymentFailed(tx, payment, ev, source);
    if (ev.outcome === 'REVERSED') return this.startReversed(tx, payment, sub, source, now);
    if (ev.outcome !== 'SUCCEEDED' && ev.outcome !== 'SUBSCRIBED') return 'noop';
    // Settled already: LiqPay's `status` of a running subscription keeps answering `subscribed`
    // (with the current amount after a `subscribe_update`); that is not a new charge.
    if (!PAYABLE.has(payment.status)) return 'noop';
    if (await this.flagMismatch(tx, payment, ev, source)) return 'mismatch';

    const paidAt = ev.occurredAt ?? now;
    const predecessors = await tx.subscription.findMany({
      where: { userId: sub.userId, id: { not: sub.id }, ...LIVE },
    });
    // A paid plan LiqPay may still charge (neither cancelled nor stopped for a monthly ↔ yearly
    // switch, B14) is never stacked.
    const conflicting = predecessors.find(
      (row) =>
        row.source === 'LIQPAY' && row.status !== 'CANCELED' && row.providerUnsubscribedAt === null,
    );
    const continued = predecessors.find((row) => row.source === 'LIQPAY' && row !== conflicting);
    const review =
      conflicting !== undefined || (sub.status !== 'PENDING' && sub.status !== 'EXPIRED');

    if (review) {
      // The money was taken but this subscription cannot hold the account's access: it ends
      // here (the reconcile job unsubscribes it at LiqPay) and the operator refunds it.
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED', endedAt: sub.endedAt ?? now },
      });
      await this.markPaid(tx, payment, ev, paidAt, { needsReview: true });
      await this.record(tx, payment, 'billing.payment_succeeded', { source, review: true });
      this.logger.warn({ msg: 'billing.subscription.stacked', subscriptionId: sub.id });
      return 'review';
    }

    for (const row of predecessors) {
      await tx.subscription.update({
        where: { id: row.id },
        data: { status: 'EXPIRED', endedAt: paidAt, pendingOfferId: null, pendingPriceId: null },
      });
    }
    // A resumed or switched plan starts where the one it continues ends: nothing paid is lost.
    const start =
      continued?.currentPeriodEnd == null ? paidAt : laterOf(paidAt, continued.currentPeriodEnd);
    const end = addInterval(start, intervalOf(sub));
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceEndsAt: null,
        endedAt: null,
        canceledAt: null,
        cancelAtPeriodEnd: false,
      },
    });
    await this.markPaid(tx, payment, ev, paidAt, { periodStart: start, periodEnd: end });
    await liftScheduledDeletion(tx, sub.userId);
    await this.record(tx, payment, 'billing.payment_succeeded', {
      source,
      continues: continued?.id ?? null,
    });
    this.logger.log({ msg: 'billing.subscription.started', subscriptionId: sub.id, source });
    return 'applied';
  }

  private async startReversed(
    tx: Db,
    payment: Payment,
    sub: Subscription,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (payment.status !== 'SUCCEEDED') return 'noop';
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REVERSED' } });
    // A chargeback ends what it paid for ([Q4]); the worker unsubscribes it at LiqPay.
    if (sub.status !== 'EXPIRED') {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED', endedAt: now },
      });
    }
    await this.record(tx, payment, 'billing.payment_reversed', { source });
    return 'applied';
  }

  // ── renewals ─────────────────────────────────────────────────────────────────────────────

  private async renewed(
    tx: Db,
    sub: Subscription,
    ev: ProviderEvent,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (sub.source !== 'LIQPAY' || sub.status === 'PENDING' || ev.providerPaymentId === null) {
      return 'noop';
    }
    // One charge, one renewal: a replayed or re-encoded callback finds its own row.
    const existing = await tx.payment.findUnique({
      where: { providerPaymentId: ev.providerPaymentId },
    });
    if (existing !== null && existing.status !== 'FAILED') return 'noop';
    const paidAt = ev.occurredAt ?? now;
    const amountMinor = ev.amountMinor;
    if (amountMinor === null || ev.currency !== sub.currency) {
      // LiqPay took something we cannot read as our price: kept for the operator, no period.
      await this.renewalRow(tx, sub, ev, existing, {
        status: 'SUCCEEDED',
        amountMinor: sub.amountMinor ?? 1,
        paidAt,
        mismatch: true,
        needsReview: true,
      });
      this.logger.warn({ msg: 'billing.payment.mismatch', subscriptionId: sub.id, source });
      return 'mismatch';
    }

    let reactivate = sub.status === 'EXPIRED';
    if (reactivate) {
      const other = await tx.subscription.findFirst({
        where: { userId: sub.userId, id: { not: sub.id }, ...LIVE },
        select: { id: true },
      });
      if (other !== null) reactivate = false;
    }
    if (sub.status === 'EXPIRED' && !reactivate) {
      // Another plan holds the account now: the charge is the operator's to refund.
      await this.renewalRow(tx, sub, ev, existing, {
        status: 'SUCCEEDED',
        amountMinor,
        paidAt,
        needsReview: true,
      });
      return 'review';
    }

    // A scheduled change takes effect with the first charge at its price [P11].
    const pending =
      sub.pendingPriceId === null
        ? null
        : await tx.billingPrice.findUnique({
            where: { id: sub.pendingPriceId },
            include: { offer: true },
          });
    // (A pending price of another interval marks a monthly ↔ yearly switch, paid by its own
    // checkout at the period end, B14: never applied by a renewal.)
    const switchNow =
      pending !== null && pending.interval === sub.interval && pending.amountMinor === amountMinor;
    const expected = new Set(
      [sub.amountMinor, sub.pendingProviderAmountMinor, pending?.amountMinor].filter(
        (value): value is number => value !== null && value !== undefined,
      ),
    );
    const start = reactivate || sub.currentPeriodEnd === null ? paidAt : sub.currentPeriodEnd;
    const interval = switchNow && pending !== null ? asCalendar(pending.interval) : intervalOf(sub);
    const end = addInterval(start, interval);
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: sub.status === 'CANCELED' ? 'CANCELED' : 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceEndsAt: null,
        endedAt: null,
        ...(switchNow && pending !== null
          ? {
              ...planFields(snapshotOf(pending.offer), pending.offer.features),
              offerId: pending.offerId,
              priceId: pending.id,
              interval: pending.interval,
              amountMinor: pending.amountMinor,
              pendingOfferId: null,
              pendingPriceId: null,
              pendingProviderAmountMinor: null,
            }
          : {}),
        ...(sub.pendingProviderAmountMinor === amountMinor
          ? { pendingProviderAmountMinor: null }
          : {}),
      },
    });
    // A charge after we stopped LiqPay (cancelled, or a switch's old plan charged before the job
    // reached it) is honoured but the operator looks at it.
    const review =
      !expected.has(amountMinor) ||
      sub.status === 'CANCELED' ||
      sub.providerUnsubscribedAt !== null;
    await this.renewalRow(tx, sub, ev, existing, {
      status: 'SUCCEEDED',
      amountMinor,
      paidAt,
      periodStart: start,
      periodEnd: end,
      needsReview: review,
      ...(switchNow && pending !== null
        ? { offerId: pending.offerId, priceId: pending.id, snapshot: snapshotOf(pending.offer) }
        : {}),
    });
    if (reactivate) await liftScheduledDeletion(tx, sub.userId);
    if (switchNow) {
      await this.audit.record(tx, {
        actor: 'system',
        action: 'billing.subscription_change',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { applied: true, offerId: pending?.offerId ?? null },
      });
    }
    this.logger.log({
      msg: 'billing.subscription.renewed',
      subscriptionId: sub.id,
      source,
      reactivated: reactivate,
      review,
    });
    return review ? 'review' : 'applied';
  }

  private async renewalFailed(
    tx: Db,
    sub: Subscription,
    ev: ProviderEvent,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (sub.source !== 'LIQPAY' || ev.providerPaymentId === null) return 'noop';
    const existing = await tx.payment.findUnique({
      where: { providerPaymentId: ev.providerPaymentId },
    });
    if (existing !== null) return 'noop';
    await this.renewalRow(tx, sub, ev, null, {
      status: 'FAILED',
      amountMinor: ev.amountMinor ?? sub.amountMinor ?? 1,
      failedAt: ev.occurredAt ?? now,
    });
    if ((sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE') || sub.currentPeriodEnd === null) {
      return 'applied';
    }
    // A late failure of an attempt that a later charge already made good changes nothing.
    const failedAt = ev.occurredAt ?? now;
    const later = await tx.payment.findFirst({
      where: { subscriptionId: sub.id, status: 'SUCCEEDED', paidAt: { gt: failedAt } },
      select: { id: true },
    });
    if (later !== null) return 'applied';
    await this.enterGrace(tx, sub);
    this.logger.log({ msg: 'billing.subscription.renewal_failed', subscriptionId: sub.id, source });
    return 'applied';
  }

  /**
   * `PAST_DUE` until `currentPeriodEnd + BILLING_GRACE_DAYS` (kept if already set) and the
   * renewal-failed mail once per period (worded as «підтвердіть оплату» for a switch whose old
   * plan was stopped, B14). Also the reconcile job's step when no renewal came; `from` (later than
   * the period end) starts the grace then instead: a plan kept active while LiqPay could not be
   * asked gets its full grace from the moment LiqPay answered.
   */
  async enterGrace(tx: Db, sub: Subscription, from?: Date): Promise<void> {
    if (sub.currentPeriodEnd === null) return;
    const start =
      from !== undefined && from.getTime() > sub.currentPeriodEnd.getTime()
        ? from
        : sub.currentPeriodEnd;
    const graceEndsAt = sub.graceEndsAt ?? addDays(start, this.env.BILLING_GRACE_DAYS);
    const notify = sub.renewalFailureNotifiedFor?.getTime() !== sub.currentPeriodEnd.getTime();
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'PAST_DUE',
        graceEndsAt,
        ...(notify ? { renewalFailureNotifiedFor: sub.currentPeriodEnd } : {}),
      },
    });
    if (notify) {
      await this.jobs.enqueue(tx, 'mail.billing-renewal-failed', {
        subscriptionId: sub.id,
        periodEnd: sub.currentPeriodEnd.toISOString(),
      });
    }
  }

  /**
   * A subscription checkout nobody paid: the pending subscription ends. (A monthly ↔ yearly
   * switch it was to confirm stays pending on the old plan, B14: the owner may pay again.)
   */
  async checkoutExpired(tx: Db, subscriptionId: string): Promise<void> {
    const sub = await lockSubscription(tx, subscriptionId);
    if (sub.status !== 'PENDING') return;
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', endedAt: new Date() },
    });
  }

  // ── cancellation at LiqPay ───────────────────────────────────────────────────────────────

  private async providerUnsubscribed(
    tx: Db,
    sub: Subscription,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (sub.source !== 'LIQPAY') return 'noop';
    // We stopped it ourselves for a monthly ↔ yearly switch (B14): it runs to its period end and
    // then into grace until the new plan is paid; it is not a cancellation.
    if (sub.status === 'ACTIVE' && sub.providerUnsubscribedAt !== null && sub.pendingPriceId) {
      return 'noop';
    }
    const cancel = sub.status === 'ACTIVE';
    if (!cancel && sub.providerUnsubscribedAt !== null) return 'noop';
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        providerUnsubscribedAt: sub.providerUnsubscribedAt ?? now,
        ...(cancel ? { status: 'CANCELED', cancelAtPeriodEnd: true, canceledAt: now } : {}),
      },
    });
    if (cancel) {
      await this.audit.record(tx, {
        actor: 'system',
        action: 'billing.subscription_cancel',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { source, by: 'provider' },
      });
    }
    return 'applied';
  }

  // ── an upgrade's prorated payment ────────────────────────────────────────────────────────

  private async upgradePaid(
    tx: Db,
    payment: Payment,
    sub: Subscription,
    ev: ProviderEvent,
    source: string,
    now: Date,
  ): Promise<SubscriptionOutcome> {
    if (ev.outcome === 'FAILED') return this.paymentFailed(tx, payment, ev, source);
    if (ev.outcome !== 'SUCCEEDED') return 'noop';
    if (!PAYABLE.has(payment.status)) return 'noop';
    if (await this.flagMismatch(tx, payment, ev, source)) return 'mismatch';
    const paidAt = ev.occurredAt ?? now;
    const live = sub.status === 'ACTIVE' || sub.status === 'PAST_DUE' || sub.status === 'CANCELED';
    const price =
      payment.priceId === null
        ? null
        : await tx.billingPrice.findUnique({ where: { id: payment.priceId } });
    if (!live || price === null || (sub.status === 'CANCELED' && sub.endedAt !== null)) {
      await this.markPaid(tx, payment, ev, paidAt, { needsReview: true });
      await this.record(tx, payment, 'billing.payment_succeeded', { source, review: true });
      return 'review';
    }
    // Paid for the period it was priced for; a renewal in between leaves it to the operator.
    const samePeriod = payment.periodEnd?.getTime() === sub.currentPeriodEnd?.getTime();
    await applyPlan(tx, sub.id, readSnapshot(payment.offerSnapshot), payment.offerId, price);
    await this.markPaid(tx, payment, ev, paidAt, { needsReview: !samePeriod });
    await this.record(tx, payment, 'billing.payment_succeeded', { source, review: !samePeriod });
    await this.audit.record(tx, {
      actor: 'system',
      action: 'billing.subscription_change',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { applied: true, kind: 'upgrade', offerId: payment.offerId },
    });
    return samePeriod ? 'applied' : 'review';
  }

  // ── shared ───────────────────────────────────────────────────────────────────────────────

  private async paymentFailed(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: string,
  ): Promise<SubscriptionOutcome> {
    if (payment.status !== 'PENDING') return 'noop';
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: ev.occurredAt ?? new Date(), errCode: ev.errCode },
    });
    await this.record(tx, payment, 'billing.payment_failed', { source, errCode: ev.errCode });
    return 'applied';
  }

  /** Another amount or currency than the checkout's: nothing is granted ([P8]). */
  private async flagMismatch(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    source: string,
  ): Promise<boolean> {
    if (ev.amountMinor === payment.amountMinor && ev.currency === payment.currency) return false;
    if (!payment.mismatch) {
      await tx.payment.update({ where: { id: payment.id }, data: { mismatch: true } });
    }
    this.logger.warn({ msg: 'billing.payment.mismatch', paymentId: payment.id, source });
    return true;
  }

  private markPaid(
    tx: Db,
    payment: Payment,
    ev: ProviderEvent,
    paidAt: Date,
    extra: { needsReview?: boolean; periodStart?: Date; periodEnd?: Date },
  ) {
    return tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        paidAt,
        errCode: null,
        needsReview: extra.needsReview ?? false,
        ...(extra.periodStart === undefined ? {} : { periodStart: extra.periodStart }),
        ...(extra.periodEnd === undefined ? {} : { periodEnd: extra.periodEnd }),
        ...(ev.providerPaymentId === null ? {} : { providerPaymentId: ev.providerPaymentId }),
      },
    });
  }

  /** The renewal's own `Payment` (a new row, or a failed attempt of the same charge settling). */
  private async renewalRow(
    tx: Db,
    sub: Subscription,
    ev: ProviderEvent,
    existing: Payment | null,
    row: {
      status: 'SUCCEEDED' | 'FAILED';
      amountMinor: number;
      paidAt?: Date;
      failedAt?: Date;
      periodStart?: Date;
      periodEnd?: Date;
      mismatch?: boolean;
      needsReview?: boolean;
      offerId?: string;
      priceId?: string;
      snapshot?: OfferSnapshot;
    },
  ): Promise<void> {
    const fields = {
      status: row.status,
      amountMinor: row.amountMinor,
      paidAt: row.paidAt ?? null,
      failedAt: row.failedAt ?? null,
      errCode: row.status === 'FAILED' ? ev.errCode : null,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      mismatch: row.mismatch ?? false,
      needsReview: row.needsReview ?? false,
    };
    if (existing !== null) {
      await tx.payment.update({ where: { id: existing.id }, data: fields });
    } else {
      const offer = await tx.billingOffer.findUniqueOrThrow({ where: { id: sub.offerId } });
      const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS "id"`;
      if (generated === undefined) throw new Error('uuidv7() returned no row');
      await tx.payment.create({
        data: {
          ...fields,
          id: generated.id,
          providerOrderId: generated.id,
          providerPaymentId: ev.providerPaymentId,
          userId: sub.userId,
          kind: 'SUBSCRIPTION_RENEWAL',
          offerId: row.offerId ?? sub.offerId,
          priceId: row.priceId ?? sub.priceId,
          subscriptionId: sub.id,
          currency: sub.currency ?? 'UAH',
          offerSnapshot: row.snapshot ?? snapshotOf(offer),
          expiresAt: row.paidAt ?? row.failedAt ?? new Date(),
        },
      });
    }
    await this.audit.record(tx, {
      actor: 'system',
      action: row.status === 'SUCCEEDED' ? 'billing.payment_succeeded' : 'billing.payment_failed',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: {
        kind: 'SUBSCRIPTION_RENEWAL',
        review: row.needsReview ?? false,
        errCode: row.status === 'FAILED' ? ev.errCode : null,
      },
    });
  }

  private record(
    tx: Db,
    payment: Payment,
    action: 'billing.payment_succeeded' | 'billing.payment_failed' | 'billing.payment_reversed',
    metadata: Record<string, string | boolean | null>,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: 'system',
      action,
      targetType: 'payment',
      targetId: payment.id,
      metadata: { kind: payment.kind, ...metadata },
    });
  }
}

/** The subscription row, locked after the owner and the payment [C9]. */
export async function lockSubscription(tx: Db, id: string): Promise<Subscription> {
  await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return tx.subscription.findUniqueOrThrow({ where: { id } });
}

function asCalendar(interval: string | null): 'MONTH' | 'YEAR' {
  return interval === 'YEAR' ? 'YEAR' : 'MONTH';
}

const intervalOf = (sub: Subscription): 'MONTH' | 'YEAR' => asCalendar(sub.interval);

/** A plan's limits from a snapshot (written by `snapshotOf` at checkout). */
function planFields(snapshot: OfferSnapshot, features: Prisma.JsonValue) {
  return {
    activeCollections: snapshot.activeCollections ?? 0,
    storageBytes: BigInt(snapshot.storageBytes ?? '0'),
    collectionStorageBytes: BigInt(snapshot.collectionStorageBytes ?? '0'),
    guestLinks: snapshot.guestLinks ?? 0,
    features: features as Prisma.InputJsonValue,
  };
}

/**
 * Switches a live subscription to another plan now (an upgrade): the snapshot's limits, the new
 * price for the next charges (`pendingProviderAmountMinor` until LiqPay confirms it).
 */
export async function applyPlan(
  tx: Db,
  subscriptionId: string,
  snapshot: OfferSnapshot,
  offerId: string,
  price: { id: string; amountMinor: number; interval: string },
): Promise<void> {
  const offer = await tx.billingOffer.findUniqueOrThrow({
    where: { id: offerId },
    select: { features: true },
  });
  await tx.subscription.update({
    where: { id: subscriptionId },
    data: {
      ...planFields(snapshot, offer.features),
      offerId,
      priceId: price.id,
      amountMinor: price.amountMinor,
      pendingProviderAmountMinor: price.amountMinor,
      pendingOfferId: null,
      pendingPriceId: null,
    },
  });
}

/** Paid access is back: scheduled deletions of the account's own collections are lifted ([P5]). */
export async function liftScheduledDeletion(tx: Db, userId: string): Promise<void> {
  await tx.collection.updateMany({
    where: { ownerId: userId, entitlement: 'ACCOUNT', deleteAfter: { not: null } },
    data: { deleteAfter: null, deletionWarnedAt30: null, deletionWarnedAt7: null },
  });
}
