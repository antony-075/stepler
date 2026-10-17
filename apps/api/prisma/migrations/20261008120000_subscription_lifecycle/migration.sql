-- Subscription renewals, grace and plan changes (ADR 0018, plan Tasks 15–17).
ALTER TABLE "Subscription" ADD COLUMN "lastRefreshAt" TIMESTAMPTZ(3),
ADD COLUMN "lastRefreshOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "providerUnsubscribedAt" TIMESTAMPTZ(3),
ADD COLUMN "pendingProviderAmountMinor" INTEGER,
ADD COLUMN "renewalFailureNotifiedFor" TIMESTAMPTZ(3);

ALTER TABLE "Payment" ADD COLUMN "periodStart" TIMESTAMPTZ(3),
ADD COLUMN "periodEnd" TIMESTAMPTZ(3);

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pending_amount_positive" CHECK ("pendingProviderAmountMinor" IS NULL OR "pendingProviderAmountMinor" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_period_order" CHECK ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" < "periodEnd");
-- A subscription payment belongs to its subscription; a pack payment to none.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscription_shape" CHECK (("kind" IN ('SUBSCRIPTION', 'SUBSCRIPTION_RENEWAL', 'SUBSCRIPTION_CHANGE')) = ("subscriptionId" IS NOT NULL));
-- The reconciliation job's scans: subscriptions due at their period or grace end.
CREATE INDEX "Subscription_grace_end_idx" ON "Subscription"("graceEndsAt") WHERE "status" = 'PAST_DUE';
