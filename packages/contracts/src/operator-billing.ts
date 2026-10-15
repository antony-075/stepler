import { z } from 'zod';
import { accessSchema } from './access.js';
import {
  billingIntervalSchema,
  currencySchema,
  entitlementLimitsSchema,
  moneySchema,
  offerKindSchema,
  packExtensionKindSchema,
  paymentKindSchema,
  paymentStatusSchema,
  subscriptionDtoSchema,
  subscriptionSourceSchema,
  subscriptionStatusSchema,
} from './billing.js';
import { moderationTextSchema } from './reports.js';

/**
 * The operator console's billing API (`/api/v1/operator/billing/*`, ADR 0018). Billing is not
 * content: the operator sees accounts' e-mails, plans and payments, never collection content.
 * Every change carries a reason for the audit log.
 */

/** `GET /api/v1/operator/billing/accounts?email=`: an exact e-mail lookup. */
export const operatorBillingAccountQuerySchema = z.object({ email: z.email().max(320) }).strict();
export type OperatorBillingAccountQuery = z.infer<typeof operatorBillingAccountQuerySchema>;

export const operatorBillingAccountSchema = z
  .object({
    userId: z.uuid(),
    email: z.email(),
    createdAt: z.iso.datetime(),
    access: accessSchema,
    trialEndsAt: z.iso.datetime().nullable(),
    /** The live paid plan or grant, if any. */
    subscription: subscriptionDtoSchema.nullable(),
  })
  .strict();
export type OperatorBillingAccount = z.infer<typeof operatorBillingAccountSchema>;

/** The largest price the editor accepts (minor units): 10 000 000,00 in any currency. */
export const OPERATOR_MAX_AMOUNT_MINOR = 1_000_000_000;

const operatorAmountSchema = z.int().positive().max(OPERATOR_MAX_AMOUNT_MINOR);

/** A live price of an offer as the operator sees it. */
export const operatorPriceSchema = z
  .object({
    id: z.uuid(),
    interval: billingIntervalSchema,
    currency: currencySchema,
    amountMinor: z.int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type OperatorPrice = z.infer<typeof operatorPriceSchema>;

/** An offer as the operator edits it: both languages, active or not, with its live prices. */
export const operatorOfferSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    kind: offerKindSchema,
    extension: packExtensionKindSchema.nullable(),
    titleUk: z.string(),
    titleEn: z.string(),
    descriptionUk: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    rank: z.int(),
    highlighted: z.boolean(),
    active: z.boolean(),
    limits: entitlementLimitsSchema,
    /** TRIAL only: the trial's length in days. */
    durationDays: z.int().positive().nullable(),
    rroItemId: z.string().nullable(),
    prices: z.array(operatorPriceSchema),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type OperatorOffer = z.infer<typeof operatorOfferSchema>;

export const operatorOfferListSchema = z.object({ items: z.array(operatorOfferSchema) }).strict();
export type OperatorOfferList = z.infer<typeof operatorOfferListSchema>;

const offerTitleSchema = z.string().trim().min(1).max(80);
const offerDescriptionSchema = z.string().trim().min(1).max(500).nullable();
const bigBytesSchema = z.string().regex(/^\d{1,20}$/);

/**
 * `PATCH /api/v1/operator/billing/offers/:id`: the editable part of an offer [B10]. Which limits
 * a kind needs is the database's rule ("BillingOffer_kind_shape"): a wrong shape is `400`.
 * Changing an offer never changes what was bought (purchases are snapshots).
 */
export const offerUpsertSchema = z
  .object({
    titleUk: offerTitleSchema,
    titleEn: offerTitleSchema,
    descriptionUk: offerDescriptionSchema,
    descriptionEn: offerDescriptionSchema,
    rank: z.int().min(0).max(1000),
    highlighted: z.boolean(),
    activeCollections: z.int().min(0).max(100_000).nullable(),
    storageBytes: bigBytesSchema.nullable(),
    collectionStorageBytes: bigBytesSchema.nullable(),
    guestLinks: z.int().min(0).max(10_000).nullable(),
    windowDays: z.int().positive().max(3650).nullable(),
    retentionDays: z.int().positive().max(3650).nullable(),
    durationDays: z.int().positive().max(365).nullable(),
    rroItemId: z.string().trim().min(1).max(64).nullable(),
    reason: moderationTextSchema,
  })
  .strict();
export type OfferUpsert = z.infer<typeof offerUpsertSchema>;

/** `POST /api/v1/operator/billing/offers`: a new offer; `code` and `kind` never change later. */
export const offerCreateSchema = offerUpsertSchema
  .extend({
    code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Lowercase letters, digits and hyphens'),
    kind: z.enum(['PACK', 'PACK_EXTENSION', 'SUBSCRIPTION']),
    extension: packExtensionKindSchema.nullable(),
  })
  .strict();
export type OfferCreate = z.infer<typeof offerCreateSchema>;

/**
 * `PUT /api/v1/operator/billing/offers/:id/prices`: the live price of one slot. The old price row
 * is kept (inactive): payments point at the price they were made with.
 */
export const priceSetSchema = z
  .object({
    interval: billingIntervalSchema,
    currency: currencySchema,
    amountMinor: operatorAmountSchema,
    reason: moderationTextSchema,
  })
  .strict();
export type PriceSet = z.infer<typeof priceSetSchema>;

/**
 * `POST /api/v1/operator/billing/grants`: a complimentary plan with an offer's limits [P13].
 * `endsAt: null` = until revoked.
 */
export const grantCreateSchema = z
  .object({
    userId: z.uuid(),
    offerId: z.uuid(),
    endsAt: z.iso.datetime().nullable(),
    reason: moderationTextSchema,
  })
  .strict();
export type GrantCreate = z.infer<typeof grantCreateSchema>;

/**
 * `POST /api/v1/operator/billing/payments/:id/refunds` with an `Idempotency-Key` header: full or
 * partial [B11]; the same key returns the refund made first.
 */
export const refundCreateSchema = z
  .object({ amountMinor: operatorAmountSchema, reason: moderationTextSchema })
  .strict();
export type RefundCreate = z.infer<typeof refundCreateSchema>;

const flagSchema = z.enum(['true', 'false']);

/** `GET /api/v1/operator/billing/payments`: newest first, cursor-paginated. */
export const paymentListQuerySchema = z
  .object({
    status: paymentStatusSchema.optional(),
    email: z.email().max(320).optional(),
    needsReview: flagSchema.optional(),
    mismatch: flagSchema.optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

/** A payment as the operator sees it: no card data, no names (LiqPay keeps those). */
export const operatorPaymentSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    email: z.email(),
    kind: paymentKindSchema,
    status: paymentStatusSchema,
    offerTitle: z.string(),
    refundedMinor: z.int().min(0),
    createdAt: z.iso.datetime(),
    paidAt: z.iso.datetime().nullable(),
    collectionId: z.uuid().nullable(),
    subscriptionId: z.uuid().nullable(),
    needsReview: z.boolean(),
    mismatch: z.boolean(),
    errCode: z.string().nullable(),
  })
  .extend(moneySchema.shape)
  .strict();
export type OperatorPayment = z.infer<typeof operatorPaymentSchema>;

export const operatorPaymentListSchema = z
  .object({ items: z.array(operatorPaymentSchema), nextCursor: z.string().nullable() })
  .strict();
export type OperatorPaymentList = z.infer<typeof operatorPaymentListSchema>;

export const refundStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED']);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundDtoSchema = z
  .object({
    id: z.uuid(),
    paymentId: z.uuid(),
    status: refundStatusSchema,
    reason: z.string(),
    /** LiqPay's answer (`reversed`, `error`, …) once it gave one. */
    providerStatus: z.string().nullable(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .extend(moneySchema.shape)
  .strict();
export type RefundDto = z.infer<typeof refundDtoSchema>;

/** A verified provider event's whitelisted fields (no names, phone, IP or card data). */
export const operatorPaymentEventSchema = z
  .object({
    id: z.uuid(),
    receivedAt: z.iso.datetime(),
    outcome: z.string().nullable(),
    processedAt: z.iso.datetime().nullable(),
    error: z.string().nullable(),
    payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();
export type OperatorPaymentEvent = z.infer<typeof operatorPaymentEventSchema>;

/** `GET /api/v1/operator/billing/payments/:id`. */
export const operatorPaymentDetailSchema = z
  .object({
    payment: operatorPaymentSchema,
    /** What can still be refunded: paid − refunded − refunds in flight. */
    refundableMinor: z.int().min(0),
    refunds: z.array(refundDtoSchema),
    events: z.array(operatorPaymentEventSchema),
  })
  .strict();
export type OperatorPaymentDetail = z.infer<typeof operatorPaymentDetailSchema>;

/** `GET /api/v1/operator/billing/subscriptions`: newest first, cursor-paginated. */
export const operatorSubscriptionListQuerySchema = z
  .object({
    status: subscriptionStatusSchema.optional(),
    source: subscriptionSourceSchema.optional(),
    email: z.email().max(320).optional(),
    /** `true`: only plans whose renewal LiqPay could not confirm («потребує перевірки»). */
    needsCheck: flagSchema.optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type OperatorSubscriptionListQuery = z.infer<typeof operatorSubscriptionListQuerySchema>;

export const operatorSubscriptionSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    email: z.email(),
    source: subscriptionSourceSchema,
    status: subscriptionStatusSchema,
    offerTitle: z.string(),
    interval: billingIntervalSchema.nullable(),
    price: moneySchema.nullable(),
    currentPeriodStart: z.iso.datetime().nullable(),
    currentPeriodEnd: z.iso.datetime().nullable(),
    graceEndsAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    endedAt: z.iso.datetime().nullable(),
    /** LiqPay confirmed it charges no more. */
    providerUnsubscribedAt: z.iso.datetime().nullable(),
    /** The last `status` check and whether LiqPay answered it. */
    lastRefreshAt: z.iso.datetime().nullable(),
    lastRefreshOk: z.boolean(),
    /**
     * LiqPay could not be asked whether the period was renewed since then: the plan keeps its
     * access and needs a look («потребує перевірки»). `null` = nothing to check.
     */
    renewalUnverifiedSince: z.iso.datetime().nullable(),
    grantReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type OperatorSubscription = z.infer<typeof operatorSubscriptionSchema>;

export const operatorSubscriptionListSchema = z
  .object({ items: z.array(operatorSubscriptionSchema), nextCursor: z.string().nullable() })
  .strict();
export type OperatorSubscriptionList = z.infer<typeof operatorSubscriptionListSchema>;

/**
 * `POST /api/v1/operator/billing/subscriptions/:id/refresh`: asks LiqPay's `status` now and applies
 * a renewal or an unsubscription it reports (the reconcile job's step, on demand). `provider` is
 * LiqPay's answer (whitelisted fields), `null` when LiqPay does not know the order.
 */
export const operatorSubscriptionRefreshSchema = z
  .object({
    subscription: operatorSubscriptionSchema,
    provider: z
      .object({
        action: z.string(),
        status: z.string(),
        paymentId: z.string().nullable(),
        amountMinor: z.int().nullable(),
        currency: z.string().nullable(),
        at: z.iso.datetime().nullable(),
      })
      .strict()
      .nullable(),
    /**
     * What LiqPay's payments archive showed for a period that ended: `RENEWED`, `FAILED`, `NONE`
     * (no charge), `UNAVAILABLE` (the archive did not answer: the plan is flagged), or
     * `NOT_EXPECTED` (the period runs, or LiqPay no longer charges the plan).
     */
    renewal: z.enum(['RENEWED', 'FAILED', 'NONE', 'UNAVAILABLE', 'NOT_EXPECTED']),
  })
  .strict();
export type OperatorSubscriptionRefresh = z.infer<typeof operatorSubscriptionRefreshSchema>;

export const operatorBillingIdParamsSchema = z.object({ id: z.uuid() });
export const operatorCollectionIdParamsSchema = z.object({ collectionId: z.uuid() });
