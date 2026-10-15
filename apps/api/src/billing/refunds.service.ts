import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RefundDto } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Payment, Prisma, Refund } from '../generated/prisma/client.js';
import { parseAmountToMinor } from './domain/money.js';
import { refundable, toRefundDto } from './operator-billing.service.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderRefundResult,
} from './provider/payment-provider.js';

type Db = Prisma.TransactionClient;

/** A refund LiqPay has not answered is asked about after this long (the reconcile job). */
export const REFUND_CHECK_AFTER_MS = 2 * 60_000;
/** …and given up (`FAILED`) after this long if LiqPay answers but shows no such refund. */
export const REFUND_GIVE_UP_AFTER_MS = 24 * 3600_000;

/**
 * Manual refunds from /ops (owner decision B11, ADR 0018, plan Task 21), full or partial, through
 * LiqPay's `refund`. The refund row is written `PENDING` and committed **before** LiqPay is
 * called, so a crash or timeout leaves a trace the reconcile job resolves through `status`
 * (`refund_amount`), and two refunds can never together exceed what was paid (the payment row is
 * locked while the amount is checked against paid − refunded − in flight). One refund per
 * `Idempotency-Key`: a replay returns the first refund and never calls LiqPay again.
 *
 * A refund does not end what was bought ([Q4]); the operator ends a pack or a plan separately.
 * A renewal has no LiqPay order of its own (it is a charge on the subscription's order), so it is
 * refunded on that order: which charge LiqPay takes it from is not documented (ADR 0018).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async refund(
    op: OperatorPrincipal,
    input: { paymentId: string; amountMinor: number; reason: string; idempotencyKey: string },
    requestId?: string,
  ): Promise<{ refund: RefundDto; created: boolean }> {
    const opened = await this.prisma.$transaction(async (tx) => {
      const payment = await lockPayment(tx, input.paymentId);
      const replay = await tx.refund.findUnique({
        where: {
          paymentId_idempotencyKey: {
            paymentId: payment.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay !== null) {
        if (replay.amountMinor !== input.amountMinor) {
          throw new AppError('IDEMPOTENCY_CONFLICT', 409);
        }
        return { refund: replay, created: false, orderId: null };
      }
      const refunds = await tx.refund.findMany({ where: { paymentId: payment.id } });
      if (input.amountMinor > refundable(payment, refunds)) {
        throw new AppError('REFUND_EXCEEDS_PAID', 409);
      }
      const orderId = await orderOf(tx, payment);
      if (orderId === null) throw new AppError('REFUND_EXCEEDS_PAID', 409);
      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: input.amountMinor,
          currency: payment.currency,
          reason: input.reason,
          operatorUserId: op.userId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await this.audit.record(tx, {
        ...(payment.collectionId === null ? {} : { collectionId: payment.collectionId }),
        actor: op,
        action: 'billing.refund',
        targetType: 'payment',
        targetId: payment.id,
        metadata: {
          refundId: refund.id,
          amountMinor: input.amountMinor,
          phase: 'requested',
          reason: input.reason,
        },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return { refund, created: true, orderId };
    });
    if (!opened.created || opened.orderId === null) {
      return { refund: toRefundDto(opened.refund), created: false };
    }
    let result: ProviderRefundResult;
    try {
      result = await this.provider.refund(opened.orderId, input.amountMinor);
    } catch {
      // Unknown whether LiqPay refunded: stays PENDING, the reconcile job asks `status`.
      this.logger.warn({ msg: 'billing.refund.provider_error', refundId: opened.refund.id });
      return { refund: toRefundDto(opened.refund), created: true };
    }
    const settled = await this.settle(opened.refund.id, result.outcome, result.rawStatus);
    return { refund: toRefundDto(settled), created: true };
  }

  /**
   * The reconcile job's step: refunds LiqPay never answered, settled from `status` — its
   * `refund_amount` is what LiqPay has refunded on the order in total.
   */
  async resolvePending(now: Date, batch = 50): Promise<number> {
    const pending = await this.prisma.refund.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - REFUND_CHECK_AFTER_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: batch,
      include: { payment: true },
    });
    let resolved = 0;
    for (const row of pending) {
      const orderId = await orderOf(this.prisma, row.payment);
      if (orderId === null) continue;
      let refundedAtProvider: number | null;
      let rawStatus: string;
      try {
        const ev = await this.provider.status(orderId);
        refundedAtProvider = ev === null ? 0 : amountOrZero(ev.safePayload.refund_amount);
        rawStatus = ev?.rawStatus ?? 'not_found';
      } catch {
        continue;
      }
      const settledBefore = await this.succeededOnOrder(row.payment, orderId);
      if (refundedAtProvider >= settledBefore + row.amountMinor) {
        await this.settle(row.id, 'SUCCEEDED', rawStatus);
        resolved += 1;
      } else if (row.createdAt.getTime() + REFUND_GIVE_UP_AFTER_MS < now.getTime()) {
        await this.settle(row.id, 'FAILED', rawStatus);
        resolved += 1;
      }
    }
    return resolved;
  }

  /** Applies LiqPay's answer once (a settled refund is never changed again). */
  private async settle(
    refundId: string,
    outcome: ProviderRefundResult['outcome'],
    rawStatus: string,
  ): Promise<Refund> {
    return this.prisma.$transaction(async (tx) => {
      const head = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      const payment = await lockPayment(tx, head.paymentId);
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      if (refund.status !== 'PENDING' || outcome === 'PENDING') {
        if (refund.status === 'PENDING') {
          return tx.refund.update({ where: { id: refundId }, data: { providerStatus: rawStatus } });
        }
        return refund;
      }
      const now = new Date();
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: { status: outcome, providerStatus: rawStatus, completedAt: now },
      });
      if (outcome === 'SUCCEEDED') {
        const refundedMinor = Math.min(
          payment.amountMinor,
          payment.refundedMinor + refund.amountMinor,
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedMinor,
            // A reversal (chargeback) already ended the payment; it keeps that status.
            ...(payment.status === 'REVERSED'
              ? {}
              : {
                  status: refundedMinor === payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
                }),
          },
        });
      }
      await this.audit.record(tx, {
        ...(payment.collectionId === null ? {} : { collectionId: payment.collectionId }),
        actor: 'system',
        action: 'billing.refund',
        targetType: 'payment',
        targetId: payment.id,
        metadata: { refundId, phase: outcome === 'SUCCEEDED' ? 'succeeded' : 'failed', rawStatus },
      });
      this.logger.log({ msg: 'billing.refund.settled', refundId, outcome, rawStatus });
      return updated;
    });
  }

  /** What LiqPay has already refunded on this order by our records (succeeded refunds). */
  private async succeededOnOrder(payment: Payment, orderId: string): Promise<number> {
    const onOrder =
      payment.subscriptionId !== null
        ? await this.prisma.payment.findMany({
            where: { subscriptionId: payment.subscriptionId },
            select: { id: true, providerOrderId: true, kind: true },
          })
        : [{ id: payment.id, providerOrderId: payment.providerOrderId, kind: payment.kind }];
    const ids = onOrder
      .filter((p) => p.providerOrderId === orderId || p.kind === 'SUBSCRIPTION_RENEWAL')
      .map((p) => p.id);
    const sum = await this.prisma.refund.aggregate({
      where: { paymentId: { in: ids }, status: 'SUCCEEDED' },
      _sum: { amountMinor: true },
    });
    return sum._sum.amountMinor ?? 0;
  }
}

/** The payment, locked in the order every writer uses [C9]: owner, collection, payment. */
async function lockPayment(tx: Db, paymentId: string): Promise<Payment> {
  const found = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, userId: true, collectionId: true },
  });
  if (found === null) throw new AppError('NOT_FOUND', 404);
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${found.userId}::uuid FOR UPDATE`;
  if (found.collectionId !== null) {
    await tx.$queryRaw`SELECT 1 FROM "Collection" WHERE "id" = ${found.collectionId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
  return tx.payment.findUniqueOrThrow({ where: { id: found.id } });
}

/**
 * LiqPay's `order_id` for a payment: its own, or — for a renewal, a charge on the subscription's
 * order — the subscription's. `null` when there is none to refund on.
 */
async function orderOf(db: Db | PrismaService, payment: Payment): Promise<string | null> {
  if (payment.kind !== 'SUBSCRIPTION_RENEWAL') return payment.providerOrderId;
  if (payment.subscriptionId === null) return null;
  const sub = await db.subscription.findUnique({
    where: { id: payment.subscriptionId },
    select: { providerOrderId: true },
  });
  return sub?.providerOrderId ?? null;
}

function amountOrZero(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  try {
    return parseAmountToMinor(value);
  } catch {
    return 0;
  }
}
