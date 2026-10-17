import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Payment, Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { PaymentTransitions, type TransitionOutcome } from './payment-transitions.js';
import { SubscriptionProviderSync } from './subscription-provider-sync.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderEvent,
} from './provider/payment-provider.js';

type Db = Prisma.TransactionClient;
type EventOutcome = TransitionOutcome | 'unknown_order';

/**
 * Provider events in, payment transitions out (ADR 0018, plan Tasks 12–13). A callback is
 * verified, stored once (`dedupeKey` = SHA-256 of the raw `data`), then applied in its own
 * transaction; if that fails, the event stays unprocessed and the reconciliation job applies it
 * later. `status` answers take the same path without an event row.
 */
@Injectable()
export class PaymentEvents {
  private readonly logger = new Logger(PaymentEvents.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: PaymentTransitions,
    private readonly sync: SubscriptionProviderSync,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /** The callback body; `400 BILLING_SIGNATURE_INVALID` for anything not signed with our key. */
  async receive(body: { data: string; signature: string }): Promise<void> {
    let ev: ProviderEvent;
    try {
      ev = this.provider.verifyCallback(body);
    } catch (error) {
      if (error instanceof AppError && error.code === 'BILLING_SIGNATURE_INVALID') {
        // Never the data or the signature: their size only.
        this.logger.warn({ msg: 'billing.callback', reason: 'signature', bytes: body.data.length });
      }
      throw error;
    }
    const dedupeKey = createHash('sha256').update(body.data).digest('hex');
    const [inserted] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "PaymentEvent" ("dedupeKey", "verified", "orderId", "payload")
      VALUES (${dedupeKey}, true, ${ev.orderId}, ${JSON.stringify(ev.safePayload)}::jsonb)
      ON CONFLICT ("dedupeKey") DO NOTHING
      RETURNING "id"::text AS "id"`;
    // A replay of a processed event changes nothing; an unprocessed one gets another try.
    const event =
      inserted ??
      (await this.prisma.paymentEvent.findUnique({
        where: { dedupeKey },
        select: { id: true, processedAt: true },
      }));
    if (event === null || ('processedAt' in event && event.processedAt !== null)) {
      this.logger.log({ msg: 'billing.callback', orderId: ev.orderId, outcome: 'replay' });
      return;
    }
    await this.processEvent(event.id, ev, 'callback');
  }

  /** Re-applies verified events whose transition never committed (the reconciliation job). */
  async reprocessUnprocessed(olderThan: Date, limit: number): Promise<number> {
    const rows = await this.prisma.paymentEvent.findMany({
      where: { processedAt: null, verified: true, receivedAt: { lt: olderThan } },
      orderBy: { receivedAt: 'asc' },
      take: limit,
      select: { id: true, orderId: true, payload: true },
    });
    for (const row of rows) {
      if (row.orderId === null) continue;
      const ev = this.provider.eventFromPayload(
        row.orderId,
        row.payload as Record<string, unknown>,
      );
      await this.processEvent(row.id, ev, 'callback');
    }
    return rows.length;
  }

  /**
   * Applies `ev` to its payment under the locks [C9] and stamps the event. Errors are recorded
   * on the event (outcome NULL, so it is retried) and not rethrown: LiqPay gets `200` either way.
   */
  private async processEvent(
    eventId: string,
    ev: ProviderEvent,
    source: 'callback',
  ): Promise<EventOutcome | null> {
    try {
      // A transition may enqueue a mail (a failed renewal); the queue is started outside the
      // transaction (ADR 0009).
      await this.jobs.ready();
      let upgraded: string | null = null;
      const outcome = await this.prisma.$transaction(async (tx) => {
        const payment = await this.lockByOrder(tx, ev.orderId);
        // Another worker processed it while this one waited for the lock.
        const stamp = await tx.paymentEvent.findUniqueOrThrow({
          where: { id: eventId },
          select: { processedAt: true },
        });
        if (stamp.processedAt !== null) return null;
        const result: EventOutcome =
          payment === null
            ? 'unknown_order'
            : await this.transitions.apply(tx, payment, ev, source);
        upgraded = result === 'applied' ? upgradedSubscription(payment) : null;
        await tx.paymentEvent.update({
          where: { id: eventId },
          data: {
            outcome: result,
            processedAt: new Date(),
            error: null,
            ...(payment === null ? {} : { paymentId: payment.id }),
          },
        });
        return result;
      });
      if (upgraded !== null) await this.sync.syncAmount(upgraded);
      this.logger.log({
        msg: 'billing.callback',
        eventId,
        orderId: ev.orderId,
        status: ev.rawStatus,
        verified: true,
        outcome,
      });
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.name : 'Error';
      await this.prisma.paymentEvent
        .update({ where: { id: eventId }, data: { error: message } })
        .catch(() => undefined);
      this.logger.error({
        msg: 'billing.callback.failed',
        eventId,
        orderId: ev.orderId,
        error: message,
      });
      return null;
    }
  }

  /**
   * A provider answer from the `status` API, applied like a callback. Returns the payment as it
   * is after the transition (`null` if the order is unknown).
   */
  async applyStatus(
    ev: ProviderEvent,
  ): Promise<{ payment: Payment; outcome: TransitionOutcome } | null> {
    await this.jobs.ready();
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockByOrder(tx, ev.orderId);
      if (payment === null) return null;
      const outcome = await this.transitions.apply(tx, payment, ev, 'status');
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return { payment: fresh, outcome };
    });
    const upgraded = result?.outcome === 'applied' ? upgradedSubscription(result.payment) : null;
    if (upgraded !== null) await this.sync.syncAmount(upgraded);
    return result;
  }

  /**
   * The payment of an `order_id`, locked in the order every writer uses [C9]: the owner, then
   * the collection, then the payment. `null` for an order that is not ours.
   */
  async lockByOrder(tx: Db, orderId: string): Promise<Payment | null> {
    const found = await tx.payment.findUnique({
      where: { providerOrderId: orderId },
      select: { id: true, userId: true, collectionId: true },
    });
    if (found === null) return null;
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${found.userId}::uuid FOR UPDATE`;
    if (found.collectionId !== null) {
      await tx.$queryRaw`SELECT 1 FROM "Collection" WHERE "id" = ${found.collectionId}::uuid FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
    return tx.payment.findUniqueOrThrow({ where: { id: found.id } });
  }
}

/** A paid upgrade's subscription: LiqPay is told its new price right after the commit. */
function upgradedSubscription(payment: Payment | null): string | null {
  return payment?.kind === 'SUBSCRIPTION_CHANGE' ? payment.subscriptionId : null;
}
