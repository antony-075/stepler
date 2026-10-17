-- A renewal whose callback was lost is found in LiqPay's payments archive; while LiqPay cannot be
-- asked, the plan keeps its access and is flagged for the operator (ADR 0018, M4 deviation).

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "renewalUnverifiedSince" TIMESTAMPTZ(3);
