-- Appeals and moderation quarantine (slice 9b, ADR 0013 addendum): the collection admin appeals
-- the Stepler operator's measures; an operator deletion quarantines a frame for 90 days before
-- the purge. Additive only: new nullable columns and a new table, no backfill.

-- CreateEnum
CREATE TYPE "AppealTargetType" AS ENUM ('CONTENT', 'COLLECTION');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'UPHELD', 'REJECTED');

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "purgeAfter" TIMESTAMPTZ(3),
ADD COLUMN     "quarantineReason" TEXT,
ADD COLUMN     "quarantinedAt" TIMESTAMPTZ(3),
ADD COLUMN     "quarantinedByUserId" UUID;

-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "targetType" "AppealTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "requestId" TEXT,
    "operatorNotifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAppeal_status_createdAt_id_idx" ON "ModerationAppeal"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ModerationAppeal_targetType_targetId_createdAt_idx" ON "ModerationAppeal"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModerationAppeal_collectionId_createdAt_idx" ON "ModerationAppeal"("collectionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModerationAppeal_submittedByUserId_createdAt_idx" ON "ModerationAppeal"("submittedByUserId", "createdAt");

-- One OPEN appeal per target; decided ones stay as history and allow a new appeal.
CREATE UNIQUE INDEX "ModerationAppeal_one_open_per_target" ON "ModerationAppeal"("targetType", "targetId") WHERE "status" = 'OPEN';

ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_text_length" CHECK (char_length("text") BETWEEN 1 AND 1000);
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_note_length" CHECK ("resolutionNote" IS NULL OR char_length("resolutionNote") BETWEEN 1 AND 500);
-- A decision sets its time and the operator together; an OPEN appeal has neither.
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_resolved_consistent" CHECK ((("status" = 'OPEN') = ("resolvedAt" IS NULL)) AND (("resolvedAt" IS NULL) = ("resolvedByUserId" IS NULL)));
-- The admin reads why their appeal was rejected.
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_rejection_note" CHECK ("status" <> 'REJECTED' OR "resolutionNote" IS NOT NULL);
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_open_has_no_note" CHECK ("status" <> 'OPEN' OR "resolutionNote" IS NULL);

-- A quarantine sets its time, the operator, the reason and the purge date together.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_quarantine_consistent" CHECK ((("quarantinedAt" IS NULL) = ("quarantinedByUserId" IS NULL)) AND (("quarantinedAt" IS NULL) = ("quarantineReason" IS NULL)) AND (("quarantinedAt" IS NULL) = ("purgeAfter" IS NULL)));
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_quarantine_reason_length" CHECK ("quarantineReason" IS NULL OR char_length("quarantineReason") BETWEEN 1 AND 500);
-- A quarantine replaces the operator's hide (an admin hide may stay, for a restore).
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_quarantine_not_operator_hidden" CHECK ("quarantinedAt" IS NULL OR "hiddenBy" IS DISTINCT FROM 'OPERATOR');

-- The hourly sweep: quarantined frames whose purge date passed.
CREATE INDEX "ContentItem_quarantine_purge_idx" ON "ContentItem"("purgeAfter") WHERE "quarantinedAt" IS NOT NULL AND "deletedAt" IS NULL;
