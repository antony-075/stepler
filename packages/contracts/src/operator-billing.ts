import { z } from 'zod';
import { accessSchema } from './access.js';
import {
  billingIntervalSchema,
  currencySchema,
  entitlementLimitsSchema,
  moneySchema,
  offerKindSchema,
  packExtensionKindSchema,
  paymentStatusSchema,
  subscriptionDtoSchema,
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

/** An offer as the operator edits it: both languages, active or not. */
export const operatorOfferSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    kind: offerKindSchema,
    extension: packExtensionKindSchema.nullable(),
    titleUk: z.string(),
    titleEn: z.string(),
    rank: z.int(),
    active: z.boolean(),
    limits: entitlementLimitsSchema,
  })
  .strict();
export type OperatorOffer = z.infer<typeof operatorOfferSchema>;

export const operatorOfferListSchema = z.object({ items: z.array(operatorOfferSchema) }).strict();
export type OperatorOfferList = z.infer<typeof operatorOfferListSchema>;

const offerTitleSchema = z.string().trim().min(1).max(80);
const offerDescriptionSchema = z.string().trim().min(1).max(500).nullable();
const bigBytesSchema = z.string().regex(/^\d{1,20}$/);

/** `POST/PATCH /api/v1/operator/billing/offers`: the editable part of an offer [B10]. */
export const offerUpsertSchema = z
  .object({
    titleUk: offerTitleSchema,
    titleEn: offerTitleSchema,
    descriptionUk: offerDescriptionSchema,
    descriptionEn: offerDescriptionSchema,
    rank: z.int().min(0).max(1000),
    activeCollections: z.int().min(0).nullable(),
    storageBytes: bigBytesSchema.nullable(),
    collectionStorageBytes: bigBytesSchema.nullable(),
    guestLinks: z.int().min(0).nullable(),
    windowDays: z.int().positive().nullable(),
    retentionDays: z.int().positive().nullable(),
    reason: moderationTextSchema,
  })
  .strict();
export type OfferUpsert = z.infer<typeof offerUpsertSchema>;

/** `PUT /api/v1/operator/billing/offers/:id/prices`: the live price of one slot. */
export const priceSetSchema = z
  .object({ interval: billingIntervalSchema, currency: currencySchema })
  .extend({ amountMinor: moneySchema.shape.amountMinor })
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

/** `POST /api/v1/operator/billing/payments/:id/refunds`: full or partial [B11]. */
export const refundCreateSchema = z
  .object({ amountMinor: moneySchema.shape.amountMinor, reason: moderationTextSchema })
  .strict();
export type RefundCreate = z.infer<typeof refundCreateSchema>;

/** `GET /api/v1/operator/billing/payments`: newest first, cursor-paginated. */
export const paymentListQuerySchema = z
  .object({
    status: paymentStatusSchema.optional(),
    email: z.email().max(320).optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const operatorBillingIdParamsSchema = z.object({ id: z.uuid() });
