-- The retention clock (ADR 0018, plan Task 6): when an account was told it became read-only,
-- once per episode. Additive, nullable, no backfill.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "readOnlyNotifiedAt" TIMESTAMPTZ(3);
