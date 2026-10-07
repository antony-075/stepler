-- Billing entitlements (ADR 0018, plan Task 3): the offer catalogue with seeded draft offers,
-- account plans (subscriptions and complimentary grants), collection packs, the trial and the
-- retention clock's columns. Additive; existing accounts get a fresh 7-day trial [Q3] and every
-- existing collection stays an ACCOUNT collection.

-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('TRIAL', 'PACK', 'PACK_EXTENSION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PackExtensionKind" AS ENUM ('WINDOW', 'RETENTION', 'STORAGE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('UAH', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('LIQPAY', 'COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "CollectionEntitlement" AS ENUM ('ACCOUNT', 'PACK');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "deleteAfter" TIMESTAMPTZ(3),
ADD COLUMN     "deletionWarnedAt30" TIMESTAMPTZ(3),
ADD COLUMN     "deletionWarnedAt7" TIMESTAMPTZ(3),
ADD COLUMN     "entitlement" "CollectionEntitlement" NOT NULL DEFAULT 'ACCOUNT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trialEndsAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "BillingOffer" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "kind" "OfferKind" NOT NULL,
    "extension" "PackExtensionKind",
    "rank" INTEGER NOT NULL DEFAULT 0,
    "titleUk" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionUk" TEXT,
    "descriptionEn" TEXT,
    "activeCollections" INTEGER,
    "storageBytes" BIGINT,
    "collectionStorageBytes" BIGINT,
    "guestLinks" INTEGER,
    "windowDays" INTEGER,
    "retentionDays" INTEGER,
    "durationDays" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "rroItemId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPrice" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "offerId" UUID NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "source" "SubscriptionSource" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "offerId" UUID NOT NULL,
    "priceId" UUID,
    "interval" "BillingInterval",
    "amountMinor" INTEGER,
    "currency" "Currency",
    "activeCollections" INTEGER NOT NULL,
    "storageBytes" BIGINT NOT NULL,
    "collectionStorageBytes" BIGINT NOT NULL,
    "guestLinks" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "graceEndsAt" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "pendingOfferId" UUID,
    "pendingPriceId" UUID,
    "providerOrderId" TEXT,
    "autoRenewConsentAt" TIMESTAMPTZ(3),
    "consentTermsVersion" TEXT,
    "grantReason" TEXT,
    "grantedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPack" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "storageBytes" BIGINT NOT NULL,
    "guestLinks" INTEGER NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "retentionEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectionPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingOffer_code_key" ON "BillingOffer"("code");

-- CreateIndex
CREATE INDEX "BillingPrice_offerId_idx" ON "BillingPrice"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerOrderId_key" ON "Subscription"("providerOrderId");

-- CreateIndex
CREATE INDEX "Subscription_userId_createdAt_idx" ON "Subscription"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Subscription_period_end_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPack_collectionId_key" ON "CollectionPack"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionPack_offerId_idx" ON "CollectionPack"("offerId");

-- AddForeignKey
ALTER TABLE "BillingPrice" ADD CONSTRAINT "BillingPrice_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BillingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BillingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "BillingPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pendingOfferId_fkey" FOREIGN KEY ("pendingOfferId") REFERENCES "BillingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pendingPriceId_fkey" FOREIGN KEY ("pendingPriceId") REFERENCES "BillingPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPack" ADD CONSTRAINT "CollectionPack_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPack" ADD CONSTRAINT "CollectionPack_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BillingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money is positive integer minor units (B2).
ALTER TABLE "BillingPrice" ADD CONSTRAINT "BillingPrice_amount_positive" CHECK ("amountMinor" > 0);
-- One live price per offer, period and currency; replaced prices stay for history.
CREATE UNIQUE INDEX "BillingPrice_one_active_per_slot" ON "BillingPrice"("offerId", "interval", "currency") WHERE "active";

-- Which limits each kind of offer needs (plan Task 3); only a trial has a duration, only an
-- extension names what it extends.
ALTER TABLE "BillingOffer" ADD CONSTRAINT "BillingOffer_kind_shape" CHECK (
  ("kind" <> 'TRIAL' OR ("durationDays" IS NOT NULL AND "activeCollections" IS NOT NULL AND "storageBytes" IS NOT NULL AND "collectionStorageBytes" IS NOT NULL AND "guestLinks" IS NOT NULL))
  AND ("kind" <> 'PACK' OR ("collectionStorageBytes" IS NOT NULL AND "guestLinks" IS NOT NULL AND "windowDays" IS NOT NULL AND "retentionDays" IS NOT NULL AND "activeCollections" IS NULL AND "storageBytes" IS NULL))
  AND (("kind" = 'PACK_EXTENSION') = ("extension" IS NOT NULL))
  AND ("kind" <> 'SUBSCRIPTION' OR ("activeCollections" IS NOT NULL AND "storageBytes" IS NOT NULL AND "collectionStorageBytes" IS NOT NULL AND "guestLinks" IS NOT NULL))
  AND ("durationDays" IS NULL OR "kind" = 'TRIAL')
);
ALTER TABLE "BillingOffer" ADD CONSTRAINT "BillingOffer_limits_positive" CHECK (
  ("activeCollections" IS NULL OR "activeCollections" >= 0) AND ("storageBytes" IS NULL OR "storageBytes" >= 0)
  AND ("collectionStorageBytes" IS NULL OR "collectionStorageBytes" >= 0) AND ("guestLinks" IS NULL OR "guestLinks" >= 0)
  AND ("windowDays" IS NULL OR "windowDays" > 0) AND ("retentionDays" IS NULL OR "retentionDays" > 0)
  AND ("durationDays" IS NULL OR "durationDays" > 0)
);
ALTER TABLE "BillingOffer" ADD CONSTRAINT "BillingOffer_code_format" CHECK ("code" ~ '^[a-z0-9][a-z0-9-]{0,39}$');

-- A paid subscription carries its price snapshot and the auto-renewal consent; a grant carries
-- the operator and the reason, and no price.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_liqpay_shape" CHECK ("source" <> 'LIQPAY' OR ("priceId" IS NOT NULL AND "interval" IS NOT NULL AND "amountMinor" IS NOT NULL AND "currency" IS NOT NULL AND "autoRenewConsentAt" IS NOT NULL));
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_grant_shape" CHECK ("source" <> 'COMPLIMENTARY' OR ("priceId" IS NULL AND "amountMinor" IS NULL AND "grantedByUserId" IS NOT NULL AND char_length("grantReason") BETWEEN 1 AND 500));
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_amount_positive" CHECK ("amountMinor" IS NULL OR "amountMinor" > 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_period_order" CHECK ("currentPeriodStart" IS NULL OR "currentPeriodEnd" IS NULL OR "currentPeriodStart" < "currentPeriodEnd");
-- At most one live plan per account (plan [P1]): pending checkout, active, in grace, or cancelled
-- but not yet ended.
CREATE UNIQUE INDEX "Subscription_one_live_per_user" ON "Subscription"("userId") WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE') OR ("status" = 'CANCELED' AND "endedAt" IS NULL);

ALTER TABLE "CollectionPack" ADD CONSTRAINT "CollectionPack_clock_order" CHECK ("activatedAt" <= "windowEndsAt" AND "windowEndsAt" <= "retentionEndsAt");
ALTER TABLE "CollectionPack" ADD CONSTRAINT "CollectionPack_limits_positive" CHECK ("storageBytes" > 0 AND "guestLinks" >= 0);

-- A deletion warning is only ever sent for a scheduled deletion.
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_deletion_warnings" CHECK (("deletionWarnedAt30" IS NULL AND "deletionWarnedAt7" IS NULL) OR "deleteAfter" IS NOT NULL);
-- The daily retention clock: collections scheduled for deletion.
CREATE INDEX "Collection_delete_after_idx" ON "Collection"("deleteAfter") WHERE "deleteAfter" IS NOT NULL;

-- Seed: draft offers (B4, B5, B7). Only the trial is live; the others have no prices and stay
-- inactive until the operator prices and activates them in /ops (complimentary grants may use
-- any subscription offer).
INSERT INTO "BillingOffer" ("code", "kind", "extension", "rank", "titleUk", "titleEn", "activeCollections", "storageBytes", "collectionStorageBytes", "guestLinks", "windowDays", "retentionDays", "durationDays", "active", "updatedAt") VALUES
  ('trial', 'TRIAL', NULL, 0, 'Пробний період', 'Trial', 1, 1073741824, 1073741824, 10, NULL, NULL, 7, true, CURRENT_TIMESTAMP),
  ('pack-start', 'PACK', NULL, 1, 'Старт', 'Start', NULL, NULL, 10737418240, 10, 30, 365, NULL, false, CURRENT_TIMESTAMP),
  ('pack-event', 'PACK', NULL, 2, 'Подія', 'Event', NULL, NULL, 53687091200, 10, 30, 365, NULL, false, CURRENT_TIMESTAMP),
  ('ext-window-30', 'PACK_EXTENSION', 'WINDOW', 10, 'Продовжити збір на 30 днів', 'Extend collecting by 30 days', NULL, NULL, NULL, NULL, 30, NULL, NULL, false, CURRENT_TIMESTAMP),
  ('ext-retention-365', 'PACK_EXTENSION', 'RETENTION', 11, 'Продовжити зберігання на рік', 'Keep for another year', NULL, NULL, NULL, NULL, NULL, 365, NULL, false, CURRENT_TIMESTAMP),
  ('ext-storage', 'PACK_EXTENSION', 'STORAGE', 12, 'Збільшити обсяг', 'More storage', NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, CURRENT_TIMESTAMP),
  ('sub-pro', 'SUBSCRIPTION', NULL, 1, 'Pro', 'Pro', 5, 214748364800, 214748364800, 20, NULL, NULL, NULL, false, CURRENT_TIMESTAMP),
  ('sub-business', 'SUBSCRIPTION', NULL, 2, 'Business', 'Business', 20, 1099511627776, 1099511627776, 50, NULL, NULL, NULL, false, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Every existing account starts a fresh 7-day trial now [Q3]; new accounts get theirs at sign-up.
UPDATE "User" SET "trialEndsAt" = CURRENT_TIMESTAMP + interval '7 days' WHERE "trialEndsAt" IS NULL;
