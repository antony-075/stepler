import { z } from 'zod';
import { accessSchema } from './access.js';
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
 * direct browser → provider step). `null` with `SUCCEEDED` when nothing was left to pay.
 */
export const checkoutResponseSchema = z
  .object({
    paymentId: z.uuid(),
    status: z.enum(['PENDING', 'SUCCEEDED']),
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
