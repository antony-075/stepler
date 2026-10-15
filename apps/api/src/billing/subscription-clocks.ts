import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { ReconciliationService, SUBSCRIPTION_CHECK_INTERVAL_MS } from './reconciliation.service.js';
import { SubscriptionProviderSync } from './subscription-provider-sync.js';
import { lockSubscription, SubscriptionTransitions } from './subscription-transitions.js';

const BATCH = 100;
/** LiqPay charges at the period end; a renewal is looked for from an hour after it. */
const RENEWAL_DUE_MS = 60 * 60_000;
/**
 * A monthly ↔ yearly switch stops the old LiqPay subscription this long before the period end
 * (B14): LiqPay charges on its own schedule, which can run minutes ahead of our period (it counts
 * from the checkout, we from the payment), and a day leaves the job many runs if LiqPay is down.
 */
export const SWITCH_STOP_LEAD_MS = 24 * 60 * 60_000;

export interface SubscriptionClockRun {
  switchesStopped: number;
  renewalsDue: number;
  /** Due plans LiqPay could not be asked about: still active, flagged for the operator. */
  unverified: number;
  graced: number;
  expired: number;
  ended: number;
  unsubscribed: number;
  priceSynced: number;
}

/**
 * The subscription clocks of the `billing.reconcile` job (ADR 0018 [P12], plan Task 16, Review
 * Focus 5). Every step is idempotent and catches up after a pause: a plan whose period ended
 * days ago goes through grace and expiry in one run, exactly as if the job had run on time.
 * 0. `ACTIVE` with a monthly ↔ yearly switch due within `SWITCH_STOP_LEAD_MS` → the old LiqPay
 *    subscription is stopped (B14); the plan runs to its end, then step 1 puts it into grace
 *    with the «підтвердіть оплату» mail until the new plan's checkout is paid;
 * 1. `ACTIVE` an hour past its period end: LiqPay is asked — `status`, then its payments
 *    archive, since `status` does not report recurring charges (2026-10-15) — and a lost renewal
 *    callback is applied. `PAST_DUE` with grace and the mail only on LiqPay's word: an explicit
 *    failed charge, or an archive that shows no charge for the period. LiqPay unreachable → the
 *    plan stays `ACTIVE`, flagged `renewalUnverifiedSince` for the operator, and is asked hourly;
 * 2. `PAST_DUE`: asked hourly; past `graceEndsAt` and LiqPay answered within the hour with no
 *    renewal → `EXPIRED` (`endedAt = currentPeriodEnd`) and LiqPay's charges are stopped. While
 *    LiqPay cannot be asked, nothing expires;
 * 3. `CANCELED` past its period end → `EXPIRED`;
 * 4. an ended paid plan LiqPay still charges → `unsubscribe` again; a price LiqPay has not
 *    confirmed → `subscribe_update` again.
 */
@Injectable()
export class SubscriptionClocks {
  private readonly logger = new Logger(SubscriptionClocks.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    private readonly transitions: SubscriptionTransitions,
    private readonly sync: SubscriptionProviderSync,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async run(now: Date): Promise<SubscriptionClockRun> {
    const result: SubscriptionClockRun = {
      switchesStopped: 0,
      renewalsDue: 0,
      unverified: 0,
      graced: 0,
      expired: 0,
      ended: 0,
      unsubscribed: 0,
      priceSynced: 0,
    };
    await this.jobs.ready();

    const switching = await this.prisma.subscription.findMany({
      where: {
        source: 'LIQPAY',
        status: 'ACTIVE',
        providerUnsubscribedAt: null,
        pendingPriceId: { not: null },
        currentPeriodEnd: { lte: new Date(now.getTime() + SWITCH_STOP_LEAD_MS) },
      },
      take: BATCH,
      select: { id: true, interval: true, pendingPrice: { select: { interval: true } } },
    });
    for (const row of switching) {
      if (row.pendingPrice === null || row.pendingPrice.interval === row.interval) continue;
      if (await this.sync.unsubscribe(row.id, now)) {
        result.switchesStopped += 1;
        this.logger.log({ msg: 'billing.subscription.switch_stopped', subscriptionId: row.id });
      }
    }

    const due = await this.prisma.subscription.findMany({
      where: {
        source: 'LIQPAY',
        status: 'ACTIVE',
        currentPeriodEnd: { lt: new Date(now.getTime() - RENEWAL_DUE_MS) },
      },
      orderBy: { currentPeriodEnd: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of due) {
      result.renewalsDue += 1;
      const { renewal, unverifiedSince } = await this.reconciliation.refreshSubscription(id, now);
      // Grace only on LiqPay's word: an explicit failure, an archive that shows no charge, or a
      // plan LiqPay no longer charges. Unanswered or not due → access stays; retried hourly.
      if (renewal !== 'NONE' && renewal !== 'FAILED' && renewal !== 'NOT_EXPECTED') {
        if (renewal === 'UNAVAILABLE') result.unverified += 1;
        continue;
      }
      if (await this.graceIfUnrenewed(id, now, unverifiedSince ? now : undefined)) {
        result.graced += 1;
      }
    }

    const pastDue = await this.prisma.subscription.findMany({
      where: { source: 'LIQPAY', status: 'PAST_DUE' },
      orderBy: { graceEndsAt: 'asc' },
      take: BATCH,
      select: { id: true, graceEndsAt: true },
    });
    for (const row of pastDue) {
      const over = row.graceEndsAt !== null && row.graceEndsAt.getTime() <= now.getTime();
      await this.reconciliation.refreshSubscription(row.id, now, over);
      if (over && (await this.expireAfterGrace(row.id, now))) result.expired += 1;
    }

    const canceled = await this.prisma.subscription.findMany({
      where: {
        source: 'LIQPAY',
        status: 'CANCELED',
        endedAt: null,
        currentPeriodEnd: { lte: now },
      },
      take: BATCH,
      select: { id: true, currentPeriodEnd: true },
    });
    for (const row of canceled) {
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: row.id, status: 'CANCELED', endedAt: null },
        data: { status: 'EXPIRED', endedAt: row.currentPeriodEnd },
      });
      result.ended += count;
    }

    // A plan that once ran at LiqPay and has ended, while LiqPay may still charge it.
    const charging = await this.prisma.subscription.findMany({
      where: {
        source: 'LIQPAY',
        status: 'EXPIRED',
        providerUnsubscribedAt: null,
        payments: { some: { kind: 'SUBSCRIPTION', paidAt: { not: null } } },
      },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of charging) {
      if (await this.sync.unsubscribe(id, now)) result.unsubscribed += 1;
    }

    const unsynced = await this.prisma.subscription.findMany({
      where: {
        pendingProviderAmountMinor: { not: null },
        status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELED'] },
        endedAt: null,
      },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of unsynced) {
      if (await this.sync.syncAmount(id)) result.priceSynced += 1;
    }
    return result;
  }

  /** Still `ACTIVE` an hour past the period end after asking LiqPay → grace. */
  private async graceIfUnrenewed(id: string, now: Date, graceFrom?: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.subscription.findUniqueOrThrow({
        where: { id },
        select: { userId: true },
      });
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${owner.userId}::uuid FOR UPDATE`;
      const sub = await lockSubscription(tx, id);
      const end = sub.currentPeriodEnd;
      if (sub.status !== 'ACTIVE' || end === null) return false;
      if (end.getTime() + RENEWAL_DUE_MS >= now.getTime()) return false;
      await this.transitions.enterGrace(tx, sub, graceFrom);
      this.logger.log({ msg: 'billing.subscription.grace', subscriptionId: id });
      return true;
    });
  }

  /**
   * Past grace with an answered check in the last hour and no renewal → `EXPIRED`, then LiqPay's
   * charges are stopped (best effort; the next run retries until LiqPay confirms).
   */
  private async expireAfterGrace(id: string, now: Date): Promise<boolean> {
    const expired = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.subscription.findUniqueOrThrow({
        where: { id },
        select: { userId: true },
      });
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${owner.userId}::uuid FOR UPDATE`;
      const sub = await lockSubscription(tx, id);
      if (sub.status !== 'PAST_DUE' || sub.graceEndsAt === null) return false;
      if (sub.graceEndsAt.getTime() > now.getTime()) return false;
      const checked =
        sub.lastRefreshOk &&
        sub.lastRefreshAt !== null &&
        sub.lastRefreshAt.getTime() > now.getTime() - SUBSCRIPTION_CHECK_INTERVAL_MS;
      if (!checked) {
        this.logger.warn({ msg: 'billing.subscription.expiry_deferred', subscriptionId: id });
        return false;
      }
      await tx.subscription.update({
        where: { id },
        data: { status: 'EXPIRED', endedAt: sub.currentPeriodEnd ?? now },
      });
      await this.audit.record(tx, {
        actor: 'system',
        action: 'billing.subscription_cancel',
        targetType: 'subscription',
        targetId: id,
        metadata: { by: 'grace_ended' },
      });
      return true;
    });
    if (expired) {
      this.logger.log({ msg: 'billing.subscription.expired', subscriptionId: id });
      await this.sync.unsubscribe(id, now);
    }
    return expired;
  }
}
