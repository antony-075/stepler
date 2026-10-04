-- Completion claims the upload instead of holding its row lock across storage calls (review I2):
-- COMPLETING with `claimedAt` while a completion checks storage outside any transaction. The
-- rules that use the new enum value follow in the next migration: PostgreSQL cannot use a value
-- added in the same transaction.

-- AlterEnum
ALTER TYPE "UploadStatus" ADD VALUE 'COMPLETING' AFTER 'INITIATED';

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "claimedAt" TIMESTAMPTZ(3);
