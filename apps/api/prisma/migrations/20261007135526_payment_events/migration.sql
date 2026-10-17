-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider" TEXT NOT NULL DEFAULT 'liqpay',
    "dedupeKey" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "orderId" TEXT,
    "paymentId" UUID,
    "payload" JSONB NOT NULL,
    "outcome" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_dedupeKey_key" ON "PaymentEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The reconciliation job's scan: verified events whose transition has not been applied yet.
CREATE INDEX "PaymentEvent_unprocessed_idx" ON "PaymentEvent"("receivedAt") WHERE "processedAt" IS NULL AND "verified";
-- Only verified events are stored (plan Task 12); the column documents it for later providers.
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_verified_only" CHECK ("verified");
