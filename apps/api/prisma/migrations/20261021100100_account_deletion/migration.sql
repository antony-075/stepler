-- Self-service account deletion (ADR 0020), step 2: when the account was deleted. A deleted
-- account keeps its row (payments and subscriptions reference it, accounting records stay) with
-- the address and name removed.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3);

ALTER TABLE "User" ADD CONSTRAINT "User_deleted_consistent"
  CHECK (("status" = 'DELETED') = ("deletedAt" IS NOT NULL));
