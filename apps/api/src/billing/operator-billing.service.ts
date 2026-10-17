import { Injectable, Logger } from '@nestjs/common';
import type {
  OperatorPayment,
  OperatorPaymentDetail,
  OperatorPaymentList,
  OperatorSubscription,
  OperatorSubscriptionList,
  OperatorSubscriptionListQuery,
  OperatorSubscriptionRefresh,
  PaymentListQuery,
  RefundDto,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { type CursorPosition, decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Payment, Refund, Subscription } from '../generated/prisma/client.js';
import { readSnapshot, snapshotTitle } from './offer-snapshot.js';
import type { ProviderEvent } from './provider/payment-provider.js';
import { ReconciliationService } from './reconciliation.service.js';
import { SubscriptionProviderSync } from './subscription-provider-sync.js';

type PaymentRow = Payment & { user: { email: string } };
type SubscriptionRow = Subscription & {
  user: { email: string };
  offer: { titleUk: string };
};

/** Explicit mapping; never a Prisma row as the contract. No card data exists to leak. */
export function toOperatorPayment(row: PaymentRow): OperatorPayment {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    kind: row.kind,
    status: row.status,
    offerTitle: snapshotTitle(readSnapshot(row.offerSnapshot), 'uk'),
    amountMinor: row.amountMinor,
    currency: row.currency,
    refundedMinor: row.refundedMinor,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    collectionId: row.collectionId,
    subscriptionId: row.subscriptionId,
    needsReview: row.needsReview,
    mismatch: row.mismatch,
    errCode: row.errCode,
  };
}

export function toRefundDto(row: Refund): RefundDto {
  return {
    id: row.id,
    paymentId: row.paymentId,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    reason: row.reason,
    providerStatus: row.providerStatus,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function toOperatorSubscription(row: SubscriptionRow): OperatorSubscription {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    source: row.source,
    status: row.status,
    offerTitle: row.offer.titleUk,
    interval: row.interval,
    price:
      row.amountMinor === null || row.currency === null
        ? null
        : { amountMinor: row.amountMinor, currency: row.currency },
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    endedAt: row.endedAt?.toISOString() ?? null,
    providerUnsubscribedAt: row.providerUnsubscribedAt?.toISOString() ?? null,
    lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null,
    lastRefreshOk: row.lastRefreshOk,
    renewalUnverifiedSince: row.renewalUnverifiedSince?.toISOString() ?? null,
    grantReason: row.grantReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Only the scalar fields of a safe payload reach the console (it is whitelisted already). */
function scalarPayload(value: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (
      field === null ||
      typeof field === 'string' ||
      typeof field === 'number' ||
      typeof field === 'boolean'
    ) {
      out[key] = field;
    }
  }
  return out;
}

function parseCursor(cursor: string | undefined): CursorPosition | undefined {
  if (cursor === undefined) return undefined;
  const position = decodeCursor(cursor);
  if (position === null) {
    throw new AppError('VALIDATION_FAILED', 400, {
      errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
    });
  }
  return position;
}

function after(position: CursorPosition | undefined) {
  return position === undefined
    ? {}
    : {
        OR: [
          { createdAt: { lt: position.createdAt } },
          { createdAt: position.createdAt, id: { lt: position.id } },
        ],
      };
}

const WITH_SUBSCRIPTION_VIEW = {
  user: { select: { email: true } },
  offer: { select: { titleUk: true } },
} as const;

/** Refunds that still hold money back: in flight or done. */
export const OPEN_REFUND_STATUSES = ['PENDING', 'SUCCEEDED'] as const;

/**
 * Billing in the operator console (ADR 0018, plan Task 21): every payment and subscription (billing
 * is not content, so no reported-scope rule), a subscription checked with LiqPay on demand, a paid
 * plan ended now and a pack ended now. Each change carries the operator's reason and is audited.
 * A refund never ends what was bought by itself ([Q4]): these two actions do, deliberately.
 */
@Injectable()
export class OperatorBillingService {
  private readonly logger = new Logger(OperatorBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reconciliation: ReconciliationService,
    private readonly sync: SubscriptionProviderSync,
  ) {}

  // ── payments ───────────────────────────────────────────────────────────────────────────

  async payments(query: PaymentListQuery): Promise<OperatorPaymentList> {
    const position = parseCursor(query.cursor);
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.email === undefined ? {} : { user: { email: query.email } }),
        ...(query.needsReview === undefined ? {} : { needsReview: query.needsReview === 'true' }),
        ...(query.mismatch === undefined ? {} : { mismatch: query.mismatch === 'true' }),
        ...after(position),
      },
      include: { user: { select: { email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toOperatorPayment),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async payment(id: string): Promise<OperatorPaymentDetail> {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { receivedAt: 'asc' }, take: 50 },
      },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return {
      payment: toOperatorPayment(row),
      refundableMinor: refundable(row, row.refunds),
      refunds: row.refunds.map(toRefundDto),
      events: row.events.map((ev) => ({
        id: ev.id,
        receivedAt: ev.receivedAt.toISOString(),
        outcome: ev.outcome,
        processedAt: ev.processedAt?.toISOString() ?? null,
        error: ev.error,
        payload: scalarPayload(ev.payload),
      })),
    };
  }

  // ── subscriptions ──────────────────────────────────────────────────────────────────────

  async subscriptions(query: OperatorSubscriptionListQuery): Promise<OperatorSubscriptionList> {
    const position = parseCursor(query.cursor);
    const rows = await this.prisma.subscription.findMany({
      where: {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.source === undefined ? {} : { source: query.source }),
        ...(query.email === undefined ? {} : { user: { email: query.email } }),
        ...(query.needsCheck === 'true' ? { renewalUnverifiedSince: { not: null } } : {}),
        ...after(position),
      },
      include: WITH_SUBSCRIPTION_VIEW,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toOperatorSubscription),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  /**
   * «Звірити з LiqPay»: LiqPay's `status` for a paid plan's order and, after the period end, its
   * payments archive, applied as the reconcile job applies them (a `regular` charge renews,
   * `unsubscribed` cancels); `renewal` = what the archive showed. A grant or a plan never
   * sent to LiqPay → `404`. LiqPay unreachable → `503`, nothing changes.
   */
  async refresh(id: string): Promise<OperatorSubscriptionRefresh> {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (sub === null || sub.source !== 'LIQPAY' || sub.providerOrderId === null) {
      throw new AppError('NOT_FOUND', 404);
    }
    const { statusAnswered, event, renewal } = await this.reconciliation.refreshSubscription(
      id,
      new Date(),
      true,
    );
    if (!statusAnswered) {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    this.logger.log({
      msg: 'billing.operator.subscription_refresh',
      subscriptionId: id,
      rawStatus: event?.rawStatus ?? null,
      action: event?.action ?? null,
    });
    return {
      subscription: await this.subscriptionView(id),
      provider: providerView(event),
      renewal: renewal === 'SKIPPED' ? 'NOT_EXPECTED' : renewal,
    };
  }

  /**
   * «Завершити зараз» (plan Task 21; the precondition of a manual account closure): LiqPay is
   * unsubscribed first and must confirm (`503` otherwise, nothing changes); then a live plan is
   * `EXPIRED` now and the account follows its usual read-only path. An ended plan LiqPay may
   * still charge is only unsubscribed. No refund is made here.
   */
  async endSubscription(
    op: OperatorPrincipal,
    id: string,
    reason: string,
    requestId?: string,
  ): Promise<OperatorSubscription> {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (sub === null || sub.source !== 'LIQPAY') throw new AppError('NOT_FOUND', 404);
    if (!(await this.sync.unsubscribe(id))) {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${sub.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM "Subscription" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const locked = await tx.subscription.findUniqueOrThrow({ where: { id } });
      const live = locked.status !== 'EXPIRED';
      if (live) {
        await tx.subscription.update({
          where: { id },
          data: {
            status: 'EXPIRED',
            endedAt: now,
            canceledAt: locked.canceledAt ?? now,
            pendingOfferId: null,
            pendingPriceId: null,
            pendingProviderAmountMinor: null,
          },
        });
      }
      await this.audit.record(tx, {
        actor: op,
        action: 'billing.subscription_end',
        targetType: 'subscription',
        targetId: id,
        metadata: { userId: sub.userId, status: locked.status, ended: live, reason },
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
    this.logger.log({ msg: 'billing.operator.subscription_end', subscriptionId: id });
    return this.subscriptionView(id);
  }

  // ── packs ──────────────────────────────────────────────────────────────────────────────

  /**
   * «Завершити пакет» ([Q4]: after a refund, when the operator means it): the window and the
   * retention end now, so the collection is read-only and goes the retention clock's way
   * (warnings, then deletion). No pack on the collection → `404`.
   */
  async endPack(
    op: OperatorPrincipal,
    collectionId: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.collection.findUnique({
        where: { id: collectionId },
        select: { ownerId: true, status: true },
      });
      if (owner === null || owner.status === 'DELETING') throw new AppError('NOT_FOUND', 404);
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${owner.ownerId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM "Collection" WHERE "id" = ${collectionId}::uuid FOR UPDATE`;
      const pack = await tx.collectionPack.findUnique({ where: { collectionId } });
      if (pack === null) throw new AppError('NOT_FOUND', 404);
      const end = new Date(Math.max(now.getTime(), pack.activatedAt.getTime()));
      if (pack.retentionEndsAt.getTime() > end.getTime()) {
        await tx.collectionPack.update({
          where: { collectionId },
          data: {
            windowEndsAt: new Date(Math.min(pack.windowEndsAt.getTime(), end.getTime())),
            retentionEndsAt: end,
          },
        });
      }
      await this.audit.record(tx, {
        collectionId,
        actor: op,
        action: 'billing.pack_end',
        targetType: 'collection',
        targetId: collectionId,
        metadata: { packId: pack.id, reason },
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
    this.logger.log({ msg: 'billing.operator.pack_end', collectionId });
  }

  private async subscriptionView(id: string): Promise<OperatorSubscription> {
    return toOperatorSubscription(
      await this.prisma.subscription.findUniqueOrThrow({
        where: { id },
        include: WITH_SUBSCRIPTION_VIEW,
      }),
    );
  }
}

/** Paid − refunded − refunds in flight; never below zero. */
export function refundable(
  payment: Pick<Payment, 'amountMinor' | 'refundedMinor' | 'status'>,
  refunds: Pick<Refund, 'status' | 'amountMinor'>[],
): number {
  if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED') return 0;
  const inFlight = refunds
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + r.amountMinor, 0);
  return Math.max(0, payment.amountMinor - payment.refundedMinor - inFlight);
}

function providerView(ev: ProviderEvent | null): OperatorSubscriptionRefresh['provider'] {
  if (ev === null) return null;
  return {
    action: typeof ev.safePayload.action === 'string' ? ev.safePayload.action : ev.action,
    status: ev.rawStatus,
    paymentId: ev.providerPaymentId,
    amountMinor: ev.amountMinor,
    currency: ev.currency,
    at: ev.occurredAt?.toISOString() ?? null,
  };
}
