-- Manual refunds from /ops (ADR 0018, plan Task 21, owner decision B11).

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "paymentId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "operatorUserId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "providerStatus" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_operatorUserId_idx" ON "Refund"("operatorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_idempotencyKey_key" ON "Refund"("paymentId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Named rules (ADR 0005).
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 500);
-- Only a finished refund carries its completion time.
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_completed_consistent" CHECK (("status" = 'PENDING') = ("completedAt" IS NULL));
-- The reconcile job looks for refunds LiqPay has not answered yet.
CREATE INDEX "Refund_pending_idx" ON "Refund"("createdAt") WHERE "status" = 'PENDING';
