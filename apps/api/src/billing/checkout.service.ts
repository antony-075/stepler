import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CheckoutRequest, CheckoutResponse } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  BillingOffer,
  BillingPrice,
  Payment,
  PaymentKind,
  Prisma,
} from '../generated/prisma/client.js';
import { CheckoutForms } from './checkout-forms.js';
import { type OfferSnapshot, snapshotOf } from './offer-snapshot.js';
import { SALE_CURRENCY } from './sale-currency.js';

type Db = Prisma.TransactionClient;
/** Subscriptions are checked out by `SubscriptionsService`. */
export type PackCheckoutRequest = Extract<CheckoutRequest, { kind: 'PACK' | 'PACK_EXTENSION' }>;
type PricedOffer = BillingPrice & { offer: BillingOffer };

const MINUTE_MS = 60_000;

/** What a checkout resolves to before anything is written. */
interface Target {
  kind: PaymentKind;
  offer: BillingOffer;
  price: BillingPrice;
  collectionId: string | null;
  newCollectionTitle: string | null;
  amountMinor: number;
  snapshot: OfferSnapshot;
}

/**
 * Pack and extension checkouts (ADR 0018, plan Task 11). The client sends ids only; the server
 * prices the target from the catalogue. One live pending checkout per target: the same request
 * again returns the same payment with a freshly signed form (that reuse is the idempotency), a
 * different offer for the same collection is `409 PAYMENT_PENDING`. Lock order [C9]: the owner,
 * then the collection.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly forms: CheckoutForms,
  ) {}

  async create(
    principal: AccountPrincipal,
    request: PackCheckoutRequest,
    requestId?: string,
  ): Promise<CheckoutResponse> {
    // Honest when payments are off (rule 18): nothing is written, nothing granted.
    if (this.env.BILLING_PROVIDER !== 'liqpay') {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
    }
    const { userId } = principal;
    const now = new Date();
    const { payment, form } = await this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ email: string; locale: 'uk' | 'en' }[]>`
        SELECT "email"::text AS "email", "locale"::text AS "locale"
        FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (user === undefined) throw new AppError('NOT_FOUND', 404);
      const priced = await this.activePrice(tx, request.priceId);
      const target =
        request.kind === 'PACK'
          ? await this.packTarget(tx, userId, priced, request.collectionId, request.title ?? null)
          : await this.extensionTarget(tx, userId, priced, request.collectionId);

      const reused = await this.pendingFor(tx, userId, target, now);
      const row = reused ?? (await this.insert(tx, principal, target, now, requestId));
      // Built inside the transaction: a fiscal refusal rolls the new row back.
      const checkoutForm = this.forms.formFor(row, target.offer, user);
      return { payment: row, form: checkoutForm };
    });
    this.logger.log({ msg: 'billing.checkout', paymentId: payment.id, kind: payment.kind });
    return { paymentId: payment.id, status: 'PENDING', form };
  }

  /**
   * A fresh form for the account's own payment that is still pending and payable: the same
   * LiqPay order again (LiqPay keeps a declined order open for another attempt). Not pending,
   * past its time, or not the account's → `409 OFFER_UNAVAILABLE` / `404`; the client then
   * starts a new purchase.
   */
  async resume(principal: AccountPrincipal, paymentId: string): Promise<CheckoutResponse> {
    if (this.env.BILLING_PROVIDER !== 'liqpay') {
      throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
    }
    const now = new Date();
    const form = await this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ email: string; locale: 'uk' | 'en' }[]>`
        SELECT "email"::text AS "email", "locale"::text AS "locale"
        FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
      if (user === undefined) throw new AppError('NOT_FOUND', 404);
      const row = await tx.payment.findFirst({
        where: { id: paymentId, userId: principal.userId },
        include: { offer: true, subscription: { select: { interval: true } } },
      });
      if (row === null) throw new AppError('NOT_FOUND', 404);
      if (row.status !== 'PENDING' || row.expiresAt.getTime() <= now.getTime()) {
        throw new AppError('OFFER_UNAVAILABLE', 409);
      }
      // A subscription's first payment is signed as a recurring checkout again, starting now.
      const interval = row.kind === 'SUBSCRIPTION' ? row.subscription?.interval : undefined;
      return this.forms.formFor(
        row,
        row.offer,
        user,
        interval === 'MONTH' || interval === 'YEAR' ? { interval, startAt: now } : undefined,
      );
    });
    this.logger.log({ msg: 'billing.checkout.resume', paymentId });
    return { paymentId, status: 'PENDING', form };
  }

  /**
   * The live UAH price of a live offer; else `409 OFFER_UNAVAILABLE` (a USD or EUR price is a
   * reference amount, never sold: `SALE_CURRENCY`).
   */
  private async activePrice(tx: Db, priceId: string): Promise<PricedOffer> {
    const price = await tx.billingPrice.findFirst({
      where: {
        id: priceId,
        active: true,
        interval: 'ONE_TIME',
        currency: SALE_CURRENCY,
        offer: { active: true },
      },
      include: { offer: true },
    });
    if (price === null) throw new AppError('OFFER_UNAVAILABLE', 409);
    return price;
  }

  /** The owner's collection, locked; `404` for a stranger's, an unknown or a deleting one. */
  private async lockCollection(tx: Db, userId: string, collectionId: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "Collection"
      WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${userId}::uuid
        AND "status" <> 'DELETING'
      FOR UPDATE`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    return tx.collection.findUniqueOrThrow({
      where: { id: collectionId },
      select: {
        id: true,
        entitlement: true,
        blockedAt: true,
        pack: { select: { offer: { select: { id: true, rank: true } } } },
      },
    });
  }

  /** A pack for an `ACCOUNT` collection, or for a new one (`collectionId: null` + title). */
  private async packTarget(
    tx: Db,
    userId: string,
    priced: PricedOffer,
    collectionId: string | null,
    title: string | null,
  ): Promise<Target> {
    if (priced.offer.kind !== 'PACK') throw new AppError('OFFER_UNAVAILABLE', 409);
    if (collectionId !== null) {
      const collection = await this.lockCollection(tx, userId, collectionId);
      // A pack collection is extended or upgraded, never bought twice; a collection the operator
      // blocked is not sold anything.
      if (collection.entitlement !== 'ACCOUNT' || collection.blockedAt !== null) {
        throw new AppError('OFFER_UNAVAILABLE', 409);
      }
    }
    return {
      kind: 'PACK',
      offer: priced.offer,
      price: priced,
      collectionId,
      newCollectionTitle: collectionId === null ? title : null,
      amountMinor: priced.amountMinor,
      snapshot: snapshotOf(priced.offer),
    };
  }

  /**
   * An extension of a pack collection: a WINDOW or RETENTION offer at its price, or a storage
   * upgrade, requested with the bigger tier's price, at the difference between the two tiers'
   * current prices ([P4], [Q4]); nothing to pay or a smaller tier → `409 OFFER_UNAVAILABLE`.
   */
  private async extensionTarget(
    tx: Db,
    userId: string,
    priced: PricedOffer,
    collectionId: string,
  ): Promise<Target> {
    const collection = await this.lockCollection(tx, userId, collectionId);
    const current = collection.pack?.offer;
    if (
      collection.entitlement !== 'PACK' ||
      current === undefined ||
      collection.blockedAt !== null
    ) {
      throw new AppError('OFFER_UNAVAILABLE', 409);
    }
    const base = {
      kind: 'PACK_EXTENSION' as const,
      offer: priced.offer,
      price: priced,
      collectionId,
    };
    const { offer } = priced;
    if (
      offer.kind === 'PACK_EXTENSION' &&
      (offer.extension === 'WINDOW' || offer.extension === 'RETENTION')
    ) {
      return {
        ...base,
        newCollectionTitle: null,
        amountMinor: priced.amountMinor,
        snapshot: snapshotOf(offer),
      };
    }
    if (offer.kind !== 'PACK' || offer.rank <= current.rank) {
      throw new AppError('OFFER_UNAVAILABLE', 409);
    }
    const currentPrice = await tx.billingPrice.findFirst({
      where: { offerId: current.id, active: true, interval: 'ONE_TIME', currency: priced.currency },
    });
    const difference = priced.amountMinor - (currentPrice?.amountMinor ?? priced.amountMinor);
    if (currentPrice === null || difference <= 0) throw new AppError('OFFER_UNAVAILABLE', 409);
    return {
      ...base,
      newCollectionTitle: null,
      amountMinor: difference,
      snapshot: snapshotOf(offer, 'STORAGE'),
    };
  }

  /**
   * The live pending checkout for the same target, if any. Pending rows past their TTL are
   * expired first (LiqPay refuses them after `expired_date` too; a late success is still
   * honoured by the transitions). Another offer pending for the collection → `409`.
   */
  private async pendingFor(
    tx: Db,
    userId: string,
    target: Target,
    now: Date,
  ): Promise<Payment | null> {
    const scope: Prisma.PaymentWhereInput =
      target.collectionId === null
        ? {
            userId,
            kind: 'PACK',
            collectionId: null,
            newCollectionTitle: target.newCollectionTitle,
          }
        : { collectionId: target.collectionId, kind: { in: ['PACK', 'PACK_EXTENSION'] } };
    await tx.payment.updateMany({
      where: { ...scope, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    const pending = await tx.payment.findMany({ where: { ...scope, status: 'PENDING' } });
    const same = pending.find(
      (row) =>
        row.offerId === target.offer.id &&
        row.priceId === target.price.id &&
        row.amountMinor === target.amountMinor,
    );
    if (same !== undefined) return same;
    if (target.collectionId !== null && pending.length > 0) {
      throw new AppError('PAYMENT_PENDING', 409);
    }
    return null;
  }

  private async insert(
    tx: Db,
    principal: AccountPrincipal,
    target: Target,
    now: Date,
    requestId: string | undefined,
  ): Promise<Payment> {
    // Our id is LiqPay's `order_id` [P8], so it is taken before the insert.
    const [generated] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS "id"`;
    if (generated === undefined) throw new Error('uuidv7() returned no row');
    const { id } = generated;
    const row = await tx.payment.create({
      data: {
        id,
        providerOrderId: id,
        userId: principal.userId,
        kind: target.kind,
        offerId: target.offer.id,
        priceId: target.price.id,
        collectionId: target.collectionId,
        newCollectionTitle: target.newCollectionTitle,
        amountMinor: target.amountMinor,
        currency: target.price.currency,
        offerSnapshot: target.snapshot,
        expiresAt: new Date(now.getTime() + this.env.BILLING_PENDING_TTL_MINUTES * MINUTE_MS),
      },
    });
    await this.audit.record(tx, {
      ...(target.collectionId === null ? {} : { collectionId: target.collectionId }),
      actor: principal,
      action: 'billing.checkout',
      targetType: 'payment',
      targetId: row.id,
      metadata: {
        kind: row.kind,
        offerId: row.offerId,
        amountMinor: row.amountMinor,
        currency: row.currency,
      },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return row;
  }
}
