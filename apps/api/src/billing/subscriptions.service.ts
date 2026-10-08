import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  BillingSummary,
  CheckoutResponse,
  PlanChangePreview,
  PlanExcess,
  SubscriptionDto,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  BillingOffer,
  BillingPrice,
  Prisma,
  Subscription,
} from '../generated/prisma/client.js';
import { UsageService } from '../limits/usage.service.js';
import { toAccessDto } from './access-dto.js';
import { toSubscriptionDto, WITH_PLAN_TITLES } from './billing-dto.js';
import { CheckoutForms, type FormUser } from './checkout-forms.js';
import { prorate } from './domain/proration.js';
import { EntitlementResolver } from './entitlement-resolver.js';
import { snapshotOf } from './offer-snapshot.js';
import {
  PAYMENT_PROVIDER,
  type CheckoutForm,
  type PaymentProvider,
} from './provider/payment-provider.js';
import { SubscriptionProviderSync } from './subscription-provider-sync.js';
import { applyPlan, lockSubscription } from './subscription-transitions.js';

type Db = Prisma.TransactionClient;
type PricedPlan = BillingPrice & { offer: BillingOffer };
type Calendar = 'MONTH' | 'YEAR';

const MINUTE_MS = 60_000;

/** The live plan of an account (the partial unique index `Subscription_one_live_per_user`). */
export const LIVE_SUBSCRIPTION: Prisma.SubscriptionWhereInput = {
  OR: [{ status: { in: ['ACTIVE', 'PAST_DUE'] } }, { status: 'CANCELED', endedAt: null }],
};

/** A plan's limits as a downgrade is checked against them [P11]. */
interface PlanLimits {
  activeCollections: number;
  storageBytes: bigint;
  collectionStorageBytes: bigint;
  guestLinks: number;
}

/** What a plan change resolved to inside its transaction. */
type Decided =
  | { response: CheckoutResponse; sync: string | null }
  | { downgrade: { sub: Subscription; target: BillingPrice & { offer: BillingOffer } } };

/** What a change to another price is, decided on the server. */
type ChangeKind = 'UPGRADE' | 'DOWNGRADE' | 'SWITCH';

const asCalendar = (interval: string | null): Calendar => (interval === 'YEAR' ? 'YEAR' : 'MONTH');

/**
 * Account subscriptions paid through LiqPay's recurring payments (ADR 0018, plan Tasks 15–17).
 * A checkout writes a `PENDING` subscription and its first payment; the callback (or a `status`
 * answer) activates it through `SubscriptionTransitions`. Every route acts only on the signed-in
 * account's own plan. Lock order [C9]: the owner first, then the subscription.
 *
 * Plan changes ([P10], [P11], [Q6]):
 * - **upgrade** (a higher-ranked, dearer plan of the same interval): a prorated one-time charge
 *   for the rest of the period (waived under `BILLING_MIN_CHARGE_MINOR`), the new limits at once,
 *   the new price from the next charge (`subscribe_update`);
 * - **downgrade** (anything else of the same interval): only if current usage fits the smaller
 *   plan; LiqPay is told the lower price at once, and the plan switches with the first charge at
 *   that price (the next renewal); cancelling the scheduled change restores the price;
 * - **monthly ↔ yearly**: LiqPay cannot change a subscription's periodicity, so it is a new
 *   recurring checkout, paid now in full, whose first period starts when the current one ends.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forms: CheckoutForms,
    private readonly sync: SubscriptionProviderSync,
    private readonly usage: UsageService,
    private readonly entitlements: EntitlementResolver,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'BILLING_MIN_CHARGE_MINOR'>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ── reads ────────────────────────────────────────────────────────────────────────────────

  /** `GET /billing/summary`: access, the trial, the live plan and the account's usage. */
  async summary(userId: string): Promise<BillingSummary> {
    const [user, access, live, usage] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { trialEndsAt: true, locale: true },
      }),
      this.entitlements.forAccount(userId),
      this.prisma.subscription.findFirst({
        where: { userId, ...LIVE_SUBSCRIPTION },
        include: WITH_PLAN_TITLES,
      }),
      this.usage.forUser(userId),
    ]);
    return {
      access: { ...toAccessDto(access), graceEndsAt: access.graceEndsAt?.toISOString() ?? null },
      trial: user.trialEndsAt === null ? null : { endsAt: user.trialEndsAt.toISOString() },
      subscription: live === null ? null : toSubscriptionDto(live, user.locale),
      usage,
    };
  }

  /** What changing to `priceId` would do; nothing is written. */
  async preview(userId: string, priceId: string): Promise<PlanChangePreview> {
    return this.prisma.$transaction(async (tx) => {
      const sub = await this.changeable(tx, userId);
      const target = await this.subscriptionPrice(tx, priceId);
      if (target.id === sub.priceId) throw new AppError('OFFER_UNAVAILABLE', 409);
      const current = await tx.billingOffer.findUniqueOrThrow({ where: { id: sub.offerId } });
      const kind = changeKind(sub, current, target);
      const locale = (await tx.user.findUniqueOrThrow({ where: { id: userId } })).locale;
      const excess =
        kind === 'UPGRADE' ? [] : await this.excess(tx, userId, limitsOf(target.offer));
      const charge =
        kind === 'UPGRADE'
          ? this.prorated(sub, target, new Date())
          : { chargeMinor: kind === 'SWITCH' ? target.amountMinor : 0, waived: false };
      return {
        kind,
        chargeMinor: charge.chargeMinor,
        waived: charge.waived,
        effective: kind === 'UPGRADE' ? 'NOW' : 'NEXT_PERIOD',
        effectiveAt:
          kind === 'UPGRADE'
            ? new Date().toISOString()
            : (sub.currentPeriodEnd?.toISOString() ?? null),
        offerTitle: locale === 'en' ? target.offer.titleEn : target.offer.titleUk,
        interval: target.interval,
        price: { amountMinor: target.amountMinor, currency: target.currency },
        blocked: excess.length === 0 ? null : excess,
      };
    });
  }

  // ── subscribing ──────────────────────────────────────────────────────────────────────────

  /**
   * `POST /billing/checkouts {kind: 'SUBSCRIPTION'}`. A live paid plan → `409
   * SUBSCRIPTION_EXISTS`, unless it is cancelled (then the new plan continues it: its first
   * period starts when the cancelled one ends). A live complimentary grant is replaced when the
   * payment succeeds. The same price while its checkout is pending → the same payment, freshly
   * signed; another price while one is pending → `409 PAYMENT_PENDING` (LiqPay keeps the first
   * order payable).
   */
  async checkout(
    principal: AccountPrincipal,
    request: { priceId: string; termsVersion: string },
    requestId?: string,
  ): Promise<CheckoutResponse> {
    this.assertEnabled();
    const now = new Date();
    const { paymentId, form } = await this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, principal.userId);
      const price = await this.subscriptionPrice(tx, request.priceId);
      const live = await tx.subscription.findFirst({
        where: { userId: principal.userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
        select: { status: true },
      });
      if (live !== null && live.status !== 'CANCELED') {
        throw new AppError('SUBSCRIPTION_EXISTS', 409);
      }
      return this.recurringCheckout(
        tx,
        principal,
        user,
        price,
        request.termsVersion,
        now,
        requestId,
      );
    });
    this.logger.log({ msg: 'billing.checkout', paymentId, kind: 'SUBSCRIPTION' });
    return { paymentId, status: 'PENDING', form };
  }

  /**
   * `POST /billing/subscription/resume`: a cancelled plan before its end, at its price, through
   * a new LiqPay checkout (a cancelled LiqPay subscription cannot be reactivated, [Q6]). Charged
   * now; the new period starts when the cancelled one ends.
   */
  async resume(
    principal: AccountPrincipal,
    termsVersion: string,
    requestId?: string,
  ): Promise<CheckoutResponse> {
    const live = await this.prisma.subscription.findFirst({
      where: { userId: principal.userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
      select: { status: true, priceId: true },
    });
    if (live === null) throw new AppError('NOT_FOUND', 404);
    if (live.status !== 'CANCELED') throw new AppError('SUBSCRIPTION_EXISTS', 409);
    if (live.priceId === null) throw new AppError('OFFER_UNAVAILABLE', 409);
    return this.checkout(principal, { priceId: live.priceId, termsVersion }, requestId);
  }

  // ── cancelling ───────────────────────────────────────────────────────────────────────────

  /**
   * `POST /billing/subscription/cancel`: LiqPay first (`unsubscribe`); only once it confirms is
   * the plan `CANCELED` (access to the period end): we never show «скасовано» while LiqPay may
   * still charge. LiqPay unreachable → `503`, nothing changes. Repeating it is a no-op.
   */
  async cancel(principal: AccountPrincipal, requestId?: string): Promise<SubscriptionDto> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: principal.userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
    });
    if (sub === null) throw new AppError('NOT_FOUND', 404);
    if (sub.status !== 'CANCELED') {
      if (!(await this.sync.unsubscribe(sub.id))) {
        throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
      }
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await lockUser(tx, principal.userId);
        const locked = await lockSubscription(tx, sub.id);
        if (locked.status !== 'ACTIVE' && locked.status !== 'PAST_DUE') return;
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'CANCELED',
            cancelAtPeriodEnd: true,
            canceledAt: now,
            pendingOfferId: null,
            pendingPriceId: null,
            pendingProviderAmountMinor: null,
          },
        });
        await this.audit.record(tx, {
          actor: principal,
          action: 'billing.subscription_cancel',
          targetType: 'subscription',
          targetId: sub.id,
          metadata: { by: 'owner', status: locked.status },
          ...(requestId === undefined ? {} : { requestId }),
        });
      });
      this.logger.log({ msg: 'billing.subscription.canceled', subscriptionId: sub.id });
    }
    return this.dto(sub.id, principal.userId);
  }

  // ── changing the plan ────────────────────────────────────────────────────────────────────

  /** `POST /billing/checkouts {kind: 'SUBSCRIPTION_CHANGE'}` (see the class comment). */
  async change(
    principal: AccountPrincipal,
    priceId: string,
    requestId?: string,
  ): Promise<CheckoutResponse> {
    this.assertEnabled();
    const { userId } = principal;
    const now = new Date();
    const decided: Decided = await this.prisma.$transaction(async (tx): Promise<Decided> => {
      const user = await lockUser(tx, userId);
      const sub = await this.changeable(tx, userId);
      await lockSubscription(tx, sub.id);
      const target = await this.subscriptionPrice(tx, priceId);
      if (target.id === sub.priceId) throw new AppError('OFFER_UNAVAILABLE', 409);
      const current = await tx.billingOffer.findUniqueOrThrow({ where: { id: sub.offerId } });
      const kind = changeKind(sub, current, target);
      if (kind === 'UPGRADE') {
        return { ...(await this.upgrade(tx, principal, user, sub, target, now, requestId)) };
      }
      const excess = await this.excess(tx, userId, limitsOf(target.offer));
      if (excess.length > 0) {
        throw new AppError('PLAN_DOWNGRADE_BLOCKED', 409, { extensions: { excess } });
      }
      if (kind === 'DOWNGRADE') return { downgrade: { sub, target } };
      // Monthly ↔ yearly: the new recurring plan, marked on the one it will replace.
      await tx.subscription.update({
        where: { id: sub.id },
        data: { pendingOfferId: target.offerId, pendingPriceId: target.id },
      });
      const checkout = await this.recurringCheckout(
        tx,
        principal,
        user,
        target,
        sub.consentTermsVersion ?? 'v2',
        now,
        requestId,
        sub.priceId,
      );
      return { response: { ...checkout, status: 'PENDING' }, sync: null };
    });

    if ('downgrade' in decided) {
      const { sub, target } = decided.downgrade;
      return this.scheduleDowngrade(principal, sub, target, requestId);
    }
    if (decided.sync !== null) await this.sync.syncAmount(decided.sync);
    this.logger.log({ msg: 'billing.subscription.change', status: decided.response.status });
    return decided.response;
  }

  /**
   * `DELETE /billing/subscription/pending-change`: the scheduled downgrade (LiqPay gets the
   * current price back first; `503` if it cannot be told) or the pending monthly ↔ yearly switch
   * (its checkout is withdrawn).
   */
  async cancelPendingChange(
    principal: AccountPrincipal,
    requestId?: string,
  ): Promise<SubscriptionDto> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: principal.userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
      include: { pendingPrice: true },
    });
    if (sub?.pendingPrice == null) throw new AppError('NOT_FOUND', 404);
    const isSwitch = sub.pendingPrice.interval !== sub.interval;
    if (!isSwitch) await this.tellPrice(sub, sub.amountMinor ?? sub.pendingPrice.amountMinor);
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, principal.userId);
      await lockSubscription(tx, sub.id);
      await tx.subscription.update({
        where: { id: sub.id },
        data: { pendingOfferId: null, pendingPriceId: null },
      });
      if (isSwitch) {
        const pending = await tx.subscription.findFirst({
          where: { userId: principal.userId, status: 'PENDING' },
          select: { id: true },
        });
        if (pending !== null) {
          await tx.payment.updateMany({
            where: { subscriptionId: pending.id, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          });
          await tx.subscription.update({
            where: { id: pending.id },
            data: { status: 'EXPIRED', endedAt: new Date() },
          });
        }
      }
      await this.audit.record(tx, {
        actor: principal,
        action: 'billing.subscription_change',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { applied: false, reason: 'withdrawn', offerId: sub.pendingOfferId },
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
    return this.dto(sub.id, principal.userId);
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.forms.enabled) throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
  }

  /** A live price of a live subscription offer, monthly or yearly; else `409`. */
  private async subscriptionPrice(tx: Db, priceId: string): Promise<PricedPlan> {
    const price = await tx.billingPrice.findFirst({
      where: {
        id: priceId,
        active: true,
        interval: { in: ['MONTH', 'YEAR'] },
        offer: { active: true, kind: 'SUBSCRIPTION' },
      },
      include: { offer: true },
    });
    if (price === null) throw new AppError('OFFER_UNAVAILABLE', 409);
    return price;
  }

  /**
   * The account's paid plan that may change: `ACTIVE`. In grace the renewal is paid first
   * (`409 PAYMENT_PENDING`, [Q6]); a cancelled plan is resumed instead (`409`); none → `404`.
   */
  private async changeable(tx: Db, userId: string): Promise<Subscription> {
    const sub = await tx.subscription.findFirst({
      where: { userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
    });
    if (sub === null) throw new AppError('NOT_FOUND', 404);
    if (sub.status === 'PAST_DUE') throw new AppError('PAYMENT_PENDING', 409);
    if (sub.status !== 'ACTIVE') throw new AppError('OFFER_UNAVAILABLE', 409);
    return sub;
  }

  private prorated(sub: Subscription, target: PricedPlan, now: Date) {
    const start = sub.currentPeriodStart;
    const end = sub.currentPeriodEnd;
    if (start === null || end === null || sub.amountMinor === null) {
      throw new AppError('OFFER_UNAVAILABLE', 409);
    }
    return prorate({
      oldPriceMinor: sub.amountMinor,
      newPriceMinor: target.amountMinor,
      periodStart: start,
      periodEnd: end,
      now,
      minChargeMinor: this.env.BILLING_MIN_CHARGE_MINOR,
    });
  }

  /** An upgrade: applied now when the charge is waived, else a prorated `pay` checkout. */
  private async upgrade(
    tx: Db,
    principal: AccountPrincipal,
    user: FormUser,
    sub: Subscription,
    target: PricedPlan,
    now: Date,
    requestId: string | undefined,
  ): Promise<{ response: CheckoutResponse; sync: string | null }> {
    const { chargeMinor, waived } = this.prorated(sub, target, now);
    if (waived) {
      await applyPlan(tx, sub.id, snapshotOf(target.offer), target.offerId, target);
      await this.audit.record(tx, {
        actor: principal,
        action: 'billing.subscription_change',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { applied: true, kind: 'upgrade', offerId: target.offerId, waived: true },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return { response: { paymentId: null, status: 'SUCCEEDED', form: null }, sync: sub.id };
    }
    await tx.payment.updateMany({
      where: {
        subscriptionId: sub.id,
        kind: 'SUBSCRIPTION_CHANGE',
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });
    const pending = await tx.payment.findFirst({
      where: { subscriptionId: sub.id, kind: 'SUBSCRIPTION_CHANGE', status: 'PENDING' },
    });
    if (pending !== null) {
      // The same upgrade again: the same order (its amount was fixed when it was priced).
      if (
        pending.priceId !== target.id ||
        pending.periodEnd?.getTime() !== sub.currentPeriodEnd?.getTime()
      ) {
        throw new AppError('PAYMENT_PENDING', 409);
      }
      return {
        response: {
          paymentId: pending.id,
          status: 'PENDING',
          form: this.forms.formFor(pending, target.offer, user),
        },
        sync: null,
      };
    }
    const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS "id"`;
    if (generated === undefined) throw new Error('uuidv7() returned no row');
    const payment = await tx.payment.create({
      data: {
        id: generated.id,
        providerOrderId: generated.id,
        userId: principal.userId,
        kind: 'SUBSCRIPTION_CHANGE',
        offerId: target.offerId,
        priceId: target.id,
        subscriptionId: sub.id,
        amountMinor: chargeMinor,
        currency: target.currency,
        offerSnapshot: snapshotOf(target.offer),
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
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
        offerId: target.offerId,
        amountMinor: chargeMinor,
        currency: payment.currency,
      },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return {
      response: {
        paymentId: payment.id,
        status: 'PENDING',
        form: this.forms.formFor(payment, target.offer, user),
      },
      sync: null,
    };
  }

  /** Tells LiqPay the lower price, then records the scheduled downgrade. */
  private async scheduleDowngrade(
    principal: AccountPrincipal,
    sub: Subscription,
    target: PricedPlan,
    requestId: string | undefined,
  ): Promise<CheckoutResponse> {
    await this.tellPrice(sub, target.amountMinor);
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, principal.userId);
      const locked = await lockSubscription(tx, sub.id);
      if (locked.status !== 'ACTIVE') throw new AppError('OFFER_UNAVAILABLE', 409);
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          pendingOfferId: target.offerId,
          pendingPriceId: target.id,
          pendingProviderAmountMinor: null,
        },
      });
      await this.audit.record(tx, {
        actor: principal,
        action: 'billing.subscription_change',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { applied: false, kind: 'downgrade', offerId: target.offerId, scheduled: true },
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
    this.logger.log({ msg: 'billing.subscription.change', status: 'SCHEDULED' });
    return { paymentId: null, status: 'SCHEDULED', form: null };
  }

  /** `subscribe_update` with the price LiqPay should charge next; `503` when it cannot be told. */
  private async tellPrice(sub: Subscription, amountMinor: number): Promise<void> {
    if (sub.providerOrderId === null || sub.currency === null) {
      throw new AppError('OFFER_UNAVAILABLE', 409);
    }
    const offer = await this.prisma.billingOffer.findUniqueOrThrow({ where: { id: sub.offerId } });
    let ok = false;
    try {
      const ev = await this.provider.updateSubscription(
        sub.providerOrderId,
        amountMinor,
        sub.currency,
        `Stepler: ${offer.titleUk}`,
      );
      ok = ev.outcome === 'SUBSCRIBED' && ev.amountMinor === amountMinor;
    } catch {
      ok = false;
    }
    if (!ok) {
      this.logger.warn({ msg: 'billing.subscription.update_failed', subscriptionId: sub.id });
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
    }
  }

  /**
   * A new recurring checkout: a `PENDING` subscription with the auto-renewal consent and its
   * first payment, or the account's pending one again for the same price.
   */
  private async recurringCheckout(
    tx: Db,
    principal: AccountPrincipal,
    user: FormUser,
    price: PricedPlan,
    termsVersion: string,
    now: Date,
    requestId: string | undefined,
    replacesPriceId: string | null = null,
  ): Promise<{ paymentId: string; form: CheckoutForm }> {
    const { userId } = principal;
    const interval = asCalendar(price.interval);
    const pending = await this.pendingCheckout(tx, userId, now);
    if (pending !== null) {
      if (pending.priceId !== price.id) throw new AppError('PAYMENT_PENDING', 409);
      return {
        paymentId: pending.payment.id,
        form: this.forms.formFor(pending.payment, price.offer, user, { interval, startAt: now }),
      };
    }
    const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS "id"`;
    if (generated === undefined) throw new Error('uuidv7() returned no row');
    const { offer } = price;
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
        consentTermsVersion: termsVersion,
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
        replacesPriceId,
      },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return {
      paymentId: payment.id,
      form: this.forms.formFor(payment, offer, user, { interval, startAt: now }),
    };
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
      return { priceId: pending.priceId, payment };
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

  /**
   * What the account uses beyond `limits` [P11]: its active account collections, account
   * storage, and each account collection's storage and additional guest links.
   */
  private async excess(tx: Db, userId: string, limits: PlanLimits): Promise<PlanExcess[]> {
    const out: PlanExcess[] = [];
    const active = await this.usage.activeCollections(userId, tx);
    if (active > limits.activeCollections) {
      out.push({
        limit: 'activeCollections',
        used: active,
        allowed: limits.activeCollections,
        collectionId: null,
      });
    }
    const stored = await this.usage.accountStorageBytes(tx, userId);
    if (stored > limits.storageBytes) {
      out.push({
        limit: 'storageBytes',
        used: Number(stored),
        allowed: Number(limits.storageBytes),
        collectionId: null,
      });
    }
    const collections = await tx.collection.findMany({
      where: { ownerId: userId, entitlement: 'ACCOUNT', status: { not: 'DELETING' } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const ids = collections.map((row) => row.id);
    const bytes = await this.usage.storageBytesByCollection(ids, tx);
    for (const id of ids) {
      const used = bytes.get(id) ?? 0n;
      if (used > limits.collectionStorageBytes) {
        out.push({
          limit: 'collectionStorageBytes',
          used: Number(used),
          allowed: Number(limits.collectionStorageBytes),
          collectionId: id,
        });
      }
    }
    const links = await tx.guestLink.groupBy({
      by: ['collectionId'],
      where: { collectionId: { in: ids }, isDefault: false, status: { not: 'REVOKED' } },
      _count: { _all: true },
    });
    for (const row of links) {
      if (row._count._all > limits.guestLinks) {
        out.push({
          limit: 'guestLinks',
          used: row._count._all,
          allowed: limits.guestLinks,
          collectionId: row.collectionId,
        });
      }
    }
    return out;
  }

  private async dto(subscriptionId: string, userId: string): Promise<SubscriptionDto> {
    const [row, user] = await Promise.all([
      this.prisma.subscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: WITH_PLAN_TITLES,
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } }),
    ]);
    return toSubscriptionDto(row, user.locale);
  }
}

function limitsOf(offer: BillingOffer): PlanLimits {
  return {
    activeCollections: offer.activeCollections ?? 0,
    storageBytes: offer.storageBytes ?? 0n,
    collectionStorageBytes: offer.collectionStorageBytes ?? 0n,
    guestLinks: offer.guestLinks ?? 0,
  };
}

/** Another interval is a switch; a higher-ranked, dearer plan an upgrade; the rest a downgrade. */
function changeKind(sub: Subscription, current: BillingOffer, target: PricedPlan): ChangeKind {
  if (asCalendar(target.interval) !== asCalendar(sub.interval)) return 'SWITCH';
  if (target.offer.rank > current.rank && target.amountMinor > (sub.amountMinor ?? 0)) {
    return 'UPGRADE';
  }
  return 'DOWNGRADE';
}

/** The owner's row, locked first [C9]; its e-mail and language go into the checkout. */
export async function lockUser(tx: Db, userId: string): Promise<FormUser> {
  const [user] = await tx.$queryRaw<FormUser[]>`
    SELECT "email"::text AS "email", "locale"::text AS "locale"
    FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  if (user === undefined) throw new AppError('NOT_FOUND', 404);
  return user;
}
