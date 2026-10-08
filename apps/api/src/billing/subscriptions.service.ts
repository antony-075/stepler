import { Injectable, Logger } from '@nestjs/common';
import type { CheckoutResponse } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { CheckoutForms, type FormUser } from './checkout-forms.js';
import { snapshotOf } from './offer-snapshot.js';

type Db = Prisma.TransactionClient;

const MINUTE_MS = 60_000;

/** The live plan of an account (the partial unique index `Subscription_one_live_per_user`). */
export const LIVE_SUBSCRIPTION: Prisma.SubscriptionWhereInput = {
  OR: [{ status: { in: ['ACTIVE', 'PAST_DUE'] } }, { status: 'CANCELED', endedAt: null }],
};

/**
 * Account subscriptions paid through LiqPay's recurring payments (ADR 0018, plan Tasks 15–17).
 * A checkout writes a `PENDING` subscription and its first payment; the callback (or a `status`
 * answer) activates it through `SubscriptionTransitions`. Lock order [C9]: the owner first.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forms: CheckoutForms,
  ) {}

  /**
   * `POST /billing/checkouts {kind: 'SUBSCRIPTION'}`. A live paid plan → `409
   * SUBSCRIPTION_EXISTS` (a live complimentary grant is replaced when the payment succeeds).
   * The same price while its checkout is pending → the same payment, freshly signed; another
   * price while one is pending → `409 PAYMENT_PENDING` (LiqPay keeps the first order payable).
   */
  async checkout(
    principal: AccountPrincipal,
    request: { priceId: string; termsVersion: string },
    requestId?: string,
  ): Promise<CheckoutResponse> {
    if (!this.forms.enabled) throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
    const { userId } = principal;
    const now = new Date();
    const { paymentId, form } = await this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      const price = await tx.billingPrice.findFirst({
        where: {
          id: request.priceId,
          active: true,
          interval: { in: ['MONTH', 'YEAR'] },
          offer: { active: true, kind: 'SUBSCRIPTION' },
        },
        include: { offer: true },
      });
      if (price === null) throw new AppError('OFFER_UNAVAILABLE', 409);
      const live = await tx.subscription.findFirst({
        where: { userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
        select: { id: true },
      });
      if (live !== null) throw new AppError('SUBSCRIPTION_EXISTS', 409);

      const pending = await this.pendingCheckout(tx, userId, now);
      if (pending !== null) {
        if (pending.priceId !== price.id) throw new AppError('PAYMENT_PENDING', 409);
        return {
          paymentId: pending.payment.id,
          form: this.forms.formFor(pending.payment, price.offer, user, {
            interval: pending.interval,
            startAt: now,
          }),
        };
      }

      const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS "id"`;
      if (generated === undefined) throw new Error('uuidv7() returned no row');
      const { offer } = price;
      const interval = price.interval === 'YEAR' ? 'YEAR' : 'MONTH';
      const subscription = await tx.subscription.create({
        data: {
          userId,
          source: 'LIQPAY',
          status: 'PENDING',
          offerId: offer.id,
          priceId: price.id,
          interval,
          amountMinor: price.amountMinor,
          currency: price.currency,
          activeCollections: offer.activeCollections ?? 0,
          storageBytes: offer.storageBytes ?? 0n,
          collectionStorageBytes: offer.collectionStorageBytes ?? 0n,
          guestLinks: offer.guestLinks ?? 0,
          features: offer.features as Prisma.InputJsonValue,
          providerOrderId: generated.id,
          autoRenewConsentAt: now,
          consentTermsVersion: request.termsVersion,
        },
      });
      const payment = await tx.payment.create({
        data: {
          id: generated.id,
          providerOrderId: generated.id,
          userId,
          kind: 'SUBSCRIPTION',
          offerId: offer.id,
          priceId: price.id,
          subscriptionId: subscription.id,
          amountMinor: price.amountMinor,
          currency: price.currency,
          offerSnapshot: snapshotOf(offer),
          expiresAt: new Date(now.getTime() + this.forms.pendingTtlMinutes * MINUTE_MS),
        },
      });
      await this.audit.record(tx, {
        actor: principal,
        action: 'billing.checkout',
        targetType: 'payment',
        targetId: payment.id,
        metadata: {
          kind: payment.kind,
          offerId: offer.id,
          interval,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
        },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return {
        paymentId: payment.id,
        form: this.forms.formFor(payment, offer, user, { interval, startAt: now }),
      };
    });
    this.logger.log({ msg: 'billing.checkout', paymentId, kind: 'SUBSCRIPTION' });
    return { paymentId, status: 'PENDING', form };
  }

  /**
   * The account's pending subscription checkout that can still be paid. One whose payment ran
   * out of time is expired here (LiqPay refuses it after `expired_date`; a late success is still
   * honoured by the transitions).
   */
  private async pendingCheckout(tx: Db, userId: string, now: Date) {
    const pending = await tx.subscription.findFirst({
      where: { userId, status: 'PENDING' },
      include: { payments: { where: { kind: 'SUBSCRIPTION' }, take: 1 } },
    });
    const payment = pending?.payments[0];
    if (pending === null || payment === undefined) return null;
    if (payment.status === 'PENDING' && payment.expiresAt.getTime() > now.getTime()) {
      const interval: 'MONTH' | 'YEAR' = pending.interval === 'YEAR' ? 'YEAR' : 'MONTH';
      return { priceId: pending.priceId, interval, payment };
    }
    await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    await tx.subscription.update({
      where: { id: pending.id },
      data: { status: 'EXPIRED', endedAt: now },
    });
    return null;
  }
}

/** The owner's row, locked first [C9]; its e-mail and language go into the checkout. */
export async function lockUser(tx: Db, userId: string): Promise<FormUser> {
  const [user] = await tx.$queryRaw<FormUser[]>`
    SELECT "email"::text AS "email", "locale"::text AS "locale"
    FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  if (user === undefined) throw new AppError('NOT_FOUND', 404);
  return user;
}
