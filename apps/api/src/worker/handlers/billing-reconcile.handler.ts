import { Injectable, Logger } from '@nestjs/common';
import { PaymentEvents } from '../../billing/payment-events.service.js';
import { EXPIRE_GRACE_MS, ReconciliationService } from '../../billing/reconciliation.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobHandler } from '../job-handler.js';

const BATCH = 100;
const PENDING_AGE_MS = 2 * 60_000;
const EVENT_AGE_MS = 60_000;

export interface ReconcileRun {
  refreshed: number;
  stale: number;
  events: number;
}

/**
 * Every 10 minutes (ADR 0018 [P7], plan Task 13): pending payments older than 2 minutes are
 * asked through LiqPay's `status` API; those past their TTL by 15 minutes with nothing final at
 * LiqPay expire; verified callbacks whose transition never committed are applied again. Every
 * step is idempotent (the transitions are), so overlapping runs and the return page's poll
 * converge. Subscriptions join in PR M3.
 */
@Injectable()
export class BillingReconcileHandler implements JobHandler<'billing.reconcile'> {
  readonly name = 'billing.reconcile';
  private readonly logger = new Logger(BillingReconcileHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    private readonly events: PaymentEvents,
  ) {}

  async handle(): Promise<void> {
    await this.run(new Date());
  }

  async run(now: Date): Promise<ReconcileRun> {
    const result: ReconcileRun = { refreshed: 0, stale: 0, events: 0 };
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - PENDING_AGE_MS) } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
      select: { id: true, expiresAt: true },
    });
    for (const row of pending) {
      if (row.expiresAt.getTime() + EXPIRE_GRACE_MS < now.getTime()) {
        await this.reconciliation.settleStale(row.id, now);
        result.stale += 1;
      } else {
        await this.reconciliation.refreshPayment(row.id, now);
        result.refreshed += 1;
      }
    }
    result.events = await this.events.reprocessUnprocessed(
      new Date(now.getTime() - EVENT_AGE_MS),
      BATCH,
    );
    this.logger.log({ msg: 'billing.reconcile', ...result });
    return result;
  }
}
