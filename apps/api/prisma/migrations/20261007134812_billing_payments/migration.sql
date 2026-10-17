-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PACK', 'PACK_EXTENSION', 'SUBSCRIPTION', 'SUBSCRIPTION_RENEWAL', 'SUBSCRIPTION_CHANGE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REVERSED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "offerId" UUID NOT NULL,
    "priceId" UUID,
    "collectionId" UUID,
    "subscriptionId" UUID,
    "newCollectionTitle" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "offerSnapshot" JSONB NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "errCode" TEXT,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "mismatch" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerOrderId_key" ON "Payment"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_id_idx" ON "Payment"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Payment_collectionId_idx" ON "Payment"("collectionId");

-- CreateIndex
CREATE INDEX "Payment_offerId_idx" ON "Payment"("offerId");

-- CreateIndex
CREATE INDEX "Payment_priceId_idx" ON "Payment"("priceId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BillingOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "BillingPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money in integer minor units (B2): positive; refunds never exceed what was paid.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_bounds" CHECK ("refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
-- Paid states and only they carry the payment time.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paid_consistent" CHECK (("status" IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED')) = ("paidAt" IS NOT NULL));
-- A new collection's title, as "Collection_title_length".
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_new_collection_title_length" CHECK ("newCollectionTitle" IS NULL OR char_length("newCollectionTitle") BETWEEN 1 AND 100);
-- One pending pack checkout per collection and offer (plan "One pending checkout per target").
CREATE UNIQUE INDEX "Payment_one_pending_per_target" ON "Payment"("collectionId", "offerId") WHERE "status" = 'PENDING' AND "kind" IN ('PACK', 'PACK_EXTENSION');
-- The reconciliation job's scan of open checkouts.
CREATE INDEX "Payment_pending_idx" ON "Payment"("status", "createdAt") WHERE "status" = 'PENDING';
