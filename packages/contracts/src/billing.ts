import { z } from 'zod';
import { accessSchema } from './access.js';
import { localeSchema } from './auth.js';
import { collectionTitleSchema } from './collections.js';
import { usageResponseSchema } from './usage.js';

export {
  accessReasonSchema,
  accessSchema,
  accessStateSchema,
  type Access,
  type AccessReason,
  type AccessState,
  collectionEntitlementSchema,
  collectionPackSchema,
  guestContributionSchema,
  type CollectionEntitlement,
  type CollectionPack,
  type GuestContribution,
} from './access.js';

/**
 * Billing (ADR 0018): the catalogue of offers, an account's plan, checkouts and payments. Money
 * is always integer minor units (kopecks) with a currency, never a float [B2]. The client sends
 * ids only; amounts, currency and limits come from the server's catalogue.
 */

export const currencySchema = z.enum(['UAH', 'EUR', 'USD']);
export type Currency = z.infer<typeof currencySchema>;

const amountMinorSchema = z.int().positive();

export const moneySchema = z
  .object({ amountMinor: amountMinorSchema, currency: currencySchema })
  .strict();
export type Money = z.infer<typeof moneySchema>;

export const offerKindSchema = z.enum(['TRIAL', 'PACK', 'PACK_EXTENSION', 'SUBSCRIPTION']);
export type OfferKind = z.infer<typeof offerKindSchema>;

export const packExtensionKindSchema = z.enum(['WINDOW', 'RETENTION', 'STORAGE']);
export type PackExtensionKind = z.infer<typeof packExtensionKindSchema>;

export const billingIntervalSchema = z.enum(['ONE_TIME', 'MONTH', 'YEAR']);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** A byte count that may pass 2^53 (a 1 TiB plan in bytes does not, but storage adds up). */
const bigBytesSchema = z.string().regex(/^\d{1,20}$/);

/**
 * What an entitlement allows [B9]. `null` = the source does not bound it: a pack has no
 * account-wide collections or storage, a pack extension none of them.
 */
export const entitlementLimitsSchema = z
  .object({
    activeCollections: z.int().min(0).nullable(),
    storageBytes: bigBytesSchema.nullable(),
    collectionStorageBytes: bigBytesSchema.nullable(),
    guestLinks: z.int().min(0).nullable(),
    windowDays: z.int().positive().nullable(),
    retentionDays: z.int().positive().nullable(),
  })
  .strict();
export type EntitlementLimits = z.infer<typeof entitlementLimitsSchema>;

export const offerPriceSchema = z
  .object({ id: z.uuid(), interval: billingIntervalSchema })
  .extend(moneySchema.shape)
  .strict();
export type OfferPrice = z.infer<typeof offerPriceSchema>;

/** `GET /api/v1/billing/offers`: an offer in the reader's language, with its live prices. */
export const offerDtoSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    kind: offerKindSchema,
    extension: packExtensionKindSchema.nullable(),
    title: z.string(),
    description: z.string().nullable(),
    limits: entitlementLimitsSchema,
    rank: z.int(),
    /** Marked «Найпопулярніший» on «Тарифи» and /pricing. */
    highlighted: z.boolean(),
    prices: z.array(offerPriceSchema),
  })
  .strict();
export type OfferDto = z.infer<typeof offerDtoSchema>;

export const subscriptionStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** `COMPLIMENTARY` = granted by the operator, nothing paid [P13]. */
export const subscriptionSourceSchema = z.enum(['LIQPAY', 'COMPLIMENTARY']);
export type SubscriptionSource = z.infer<typeof subscriptionSourceSchema>;

/**
 * A plan change scheduled for the current period's end: a downgrade ([P11], applied with the
 * next charge) or a monthly ↔ yearly switch (owner decision B14: nothing is charged now; at the
 * period end the old LiqPay subscription is stopped and the owner confirms the new one through a
 * checkout of `priceId`, `awaitingPayment: true` from then on, grace as usual until paid).
 */
export const pendingPlanChangeSchema = z
  .object({
    kind: z.enum(['DOWNGRADE', 'SWITCH']),
    offerId: z.uuid(),
    priceId: z.uuid(),
    offerTitle: z.string(),
    interval: billingIntervalSchema,
    price: moneySchema,
    /** When it takes effect: the current period's end. */
    effectiveAt: z.iso.datetime().nullable(),
    /** A switch whose old subscription has stopped: the new one is paid with `kind: 'SUBSCRIPTION'`. */
    awaitingPayment: z.boolean(),
  })
  .strict();
export type PendingPlanChange = z.infer<typeof pendingPlanChangeSchema>;

/**
 * An account-level plan: a paid subscription or a complimentary grant. The limits are the
 * snapshot taken when it started [B10]; `currentPeriodEnd: null` = a grant without an end.
 */
export const subscriptionDtoSchema = z
  .object({
    id: z.uuid(),
    source: subscriptionSourceSchema,
    status: subscriptionStatusSchema,
    offerId: z.uuid(),
    offerTitle: z.string(),
    interval: billingIntervalSchema.nullable(),
    price: moneySchema.nullable(),
    limits: entitlementLimitsSchema,
    currentPeriodStart: z.iso.datetime().nullable(),
    currentPeriodEnd: z.iso.datetime().nullable(),
    graceEndsAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    pendingChange: pendingPlanChangeSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type SubscriptionDto = z.infer<typeof subscriptionDtoSchema>;

/** `GET /api/v1/billing/summary`: «Тариф і оплата». */
export const billingSummarySchema = z
  .object({
    access: accessSchema.extend({ graceEndsAt: z.iso.datetime().nullable() }).strict(),
    trial: z.object({ endsAt: z.iso.datetime() }).strict().nullable(),
    subscription: subscriptionDtoSchema.nullable(),
    usage: usageResponseSchema,
  })
  .strict();
export type BillingSummary = z.infer<typeof billingSummarySchema>;

/**
 * `POST /api/v1/billing/checkouts`. Ids only: the server prices the target. A pack is bought
 * for one collection or creates one (`collectionId: null` + `title`, and only then a title).
 */
const packCheckoutSchema = z
  .object({
    kind: z.literal('PACK'),
    priceId: z.uuid(),
    collectionId: z.uuid().nullable(),
    title: collectionTitleSchema.optional(),
  })
  .strict()
  .refine((body) => (body.collectionId === null) === (body.title !== undefined), {
    message: 'A new collection needs a title; an existing one takes none',
    path: ['title'],
  });

export const checkoutRequestSchema = z.discriminatedUnion('kind', [
  packCheckoutSchema,
  z
    .object({ kind: z.literal('PACK_EXTENSION'), priceId: z.uuid(), collectionId: z.uuid() })
    .strict(),
  z
    .object({
      kind: z.literal('SUBSCRIPTION'),
      priceId: z.uuid(),
      /** The «автоматичне продовження» checkbox; the server records when it was given. */
      autoRenewConsent: z.literal(true),
      termsVersion: z.string().min(1).max(20),
    })
    .strict(),
  z.object({ kind: z.literal('SUBSCRIPTION_CHANGE'), priceId: z.uuid() }).strict(),
]);
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/**
 * The provider's checkout form: the browser posts these fields to `action` (ADR 0018: the only
 * direct browser → provider step). A plan change may need no payment: `SUCCEEDED` (an upgrade
 * whose prorated charge was waived, applied now) or `SCHEDULED` (a downgrade or a monthly ↔
 * yearly switch from the next period); then `form` and `paymentId` are `null`.
 */
export const checkoutResponseSchema = z
  .object({
    paymentId: z.uuid().nullable(),
    status: z.enum(['PENDING', 'SUCCEEDED', 'SCHEDULED']),
    form: z
      .object({
        action: z.url(),
        fields: z.object({ data: z.string(), signature: z.string() }).strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const paymentKindSchema = z.enum([
  'PACK',
  'PACK_EXTENSION',
  'SUBSCRIPTION',
  'SUBSCRIPTION_RENEWAL',
  'SUBSCRIPTION_CHANGE',
]);
export type PaymentKind = z.infer<typeof paymentKindSchema>;

export const paymentStatusSchema = z.enum([
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'REVERSED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentDtoSchema = z
  .object({
    id: z.uuid(),
    kind: paymentKindSchema,
    status: paymentStatusSchema,
    createdAt: z.iso.datetime(),
    paidAt: z.iso.datetime().nullable(),
    offerTitle: z.string(),
    collectionId: z.uuid().nullable(),
    refundedMinor: z.int().min(0),
  })
  .extend(moneySchema.shape)
  .strict();
export type PaymentDto = z.infer<typeof paymentDtoSchema>;

/** `GET /api/v1/billing/offers?locale=`: public; the page asks in its own language. */
export const offerListQuerySchema = z.object({ locale: localeSchema.default('uk') }).strict();
export type OfferListQuery = z.infer<typeof offerListQuerySchema>;

/** Active offers with at least one active price, best first per kind; never the trial. */
export const offerListSchema = z.object({ items: z.array(offerDtoSchema) }).strict();
export type OfferList = z.infer<typeof offerListSchema>;

/** `GET /api/v1/billing/payments`: the account's own payments, newest first. */
export const accountPaymentListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type AccountPaymentListQuery = z.infer<typeof accountPaymentListQuerySchema>;

export const paymentListSchema = z
  .object({ items: z.array(paymentDtoSchema), nextCursor: z.string().nullable() })
  .strict();
export type PaymentList = z.infer<typeof paymentListSchema>;

export const paymentIdParamsSchema = z.object({ id: z.uuid() }).strict();

/** `POST /api/v1/billing/subscription/resume`: a cancelled plan again, with a new consent. */
export const subscriptionResumeSchema = z
  .object({ autoRenewConsent: z.literal(true), termsVersion: z.string().min(1).max(20) })
  .strict();
export type SubscriptionResume = z.infer<typeof subscriptionResumeSchema>;

/** What a smaller plan would not hold, and by how much (`409 PLAN_DOWNGRADE_BLOCKED`). */
export const planExcessSchema = z
  .object({
    limit: z.enum(['activeCollections', 'storageBytes', 'collectionStorageBytes', 'guestLinks']),
    used: z.number().int().min(0),
    allowed: z.number().int().min(0),
    /** The collection over a per-collection limit. */
    collectionId: z.uuid().nullable(),
  })
  .strict();
export type PlanExcess = z.infer<typeof planExcessSchema>;

/** `GET /api/v1/billing/subscription/change-preview?priceId=`. */
export const planChangePreviewQuerySchema = z.object({ priceId: z.uuid() }).strict();
export type PlanChangePreviewQuery = z.infer<typeof planChangePreviewQuerySchema>;

/**
 * What changing to `priceId` would do, computed on the server [P10], [P11]: an upgrade is
 * charged now (`chargeMinor`, waived under the minimum) and applies now; a downgrade applies
 * from the period end; a monthly ↔ yearly switch is scheduled for the period end and charges
 * nothing now (`chargeMinor: 0`, B14: its own checkout follows then). `blocked` lists what to
 * reduce before a smaller plan can be chosen.
 */
export const planChangePreviewSchema = z
  .object({
    kind: z.enum(['UPGRADE', 'DOWNGRADE', 'SWITCH']),
    chargeMinor: z.int().min(0),
    waived: z.boolean(),
    effective: z.enum(['NOW', 'NEXT_PERIOD']),
    effectiveAt: z.iso.datetime().nullable(),
    offerTitle: z.string(),
    interval: billingIntervalSchema,
    price: moneySchema,
    blocked: z.array(planExcessSchema).nullable(),
  })
  .strict();
export type PlanChangePreview = z.infer<typeof planChangePreviewSchema>;
