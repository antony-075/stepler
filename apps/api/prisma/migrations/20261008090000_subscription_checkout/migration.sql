-- Subscriptions are sold (ADR 0018, plan Task 15). A checkout creates a PENDING subscription
-- while the account may still hold a live plan: a complimentary grant (replaced when the payment
-- succeeds) or a cancelled subscription that runs to its period end (resumed by a new checkout).
-- So a pending checkout no longer counts as the live plan; it has its own one-per-account rule.
DROP INDEX "Subscription_one_live_per_user";
CREATE UNIQUE INDEX "Subscription_one_live_per_user" ON "Subscription"("userId") WHERE "status" IN ('ACTIVE', 'PAST_DUE') OR ("status" = 'CANCELED' AND "endedAt" IS NULL);
CREATE UNIQUE INDEX "Subscription_one_pending_per_user" ON "Subscription"("userId") WHERE "status" = 'PENDING';
