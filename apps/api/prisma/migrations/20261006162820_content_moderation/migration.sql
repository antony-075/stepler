-- Content reports and moderation (slice 9, ADR 0013): guests report frames, admins and the
-- Stepler operator hide them from guests, the operator blocks collections. Additive only: every
-- new column is nullable or has a default, so no backfill; existing rows read as "not hidden",
-- "not blocked". `ContentReport` has no foreign keys (spec §7.4): reports outlive what they name.

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('ILLEGAL', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "HiddenBy" AS ENUM ('ADMIN', 'OPERATOR');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "blockedAt" TIMESTAMPTZ(3),
ADD COLUMN     "blockedReason" TEXT;

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "hiddenAt" TIMESTAMPTZ(3),
ADD COLUMN     "hiddenBy" "HiddenBy",
ADD COLUMN     "hiddenByUserId" UUID,
ADD COLUMN     "hiddenReason" TEXT;

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "contentId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "reporterGuestSessionId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "reporterEmail" CITEXT,
    "reporterLocale" "Locale",
    "requestId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "adminDismissedAt" TIMESTAMPTZ(3),
    "operatorNotifiedAt" TIMESTAMPTZ(3),
    "reporterNotifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_id_idx" ON "ContentReport"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ContentReport_contentId_status_idx" ON "ContentReport"("contentId", "status");

-- CreateIndex
CREATE INDEX "ContentReport_collectionId_idx" ON "ContentReport"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_reporterGuestSessionId_idempotencyKey_key" ON "ContentReport"("reporterGuestSessionId", "idempotencyKey");

-- One OPEN report per guest session and item ([P4]); a decided one does not block a new report.
CREATE UNIQUE INDEX "ContentReport_one_open_per_guest" ON "ContentReport"("reporterGuestSessionId", "contentId") WHERE "status" = 'OPEN';
-- The admin's «Скарги»: open reports they have not dismissed, per collection and item.
CREATE INDEX "ContentReport_admin_open_idx" ON "ContentReport"("collectionId", "contentId") WHERE "status" = 'OPEN' AND "adminDismissedAt" IS NULL;

-- A decision sets the time, the operator and the note together; an OPEN report has none.
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_resolved_consistent" CHECK ((("status" = 'OPEN') = ("resolvedAt" IS NULL)) AND (("resolvedAt" IS NULL) = ("resolvedByUserId" IS NULL)) AND (("resolvedAt" IS NULL) = ("resolutionNote" IS NULL)));
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_description_length" CHECK ("description" IS NULL OR char_length("description") BETWEEN 1 AND 1000);
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_note_length" CHECK ("resolutionNote" IS NULL OR char_length("resolutionNote") BETWEEN 1 AND 500);
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_email_length" CHECK ("reporterEmail" IS NULL OR char_length("reporterEmail") <= 254);
-- The locale is kept only for the decision mail, so it goes with the address.
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_contact_consistent" CHECK (("reporterEmail" IS NULL) = ("reporterLocale" IS NULL));

-- A hide sets the time, who (ADMIN or OPERATOR) and the account together.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_hidden_consistent" CHECK ((("hiddenAt" IS NULL) = ("hiddenBy" IS NULL)) AND (("hiddenAt" IS NULL) = ("hiddenByUserId" IS NULL)));
-- The operator always says why; the admin sees the reason.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_operator_hide_reason" CHECK ("hiddenBy" IS DISTINCT FROM 'OPERATOR' OR "hiddenReason" IS NOT NULL);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_hidden_reason_length" CHECK ("hiddenReason" IS NULL OR char_length("hiddenReason") BETWEEN 1 AND 500);

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_blocked_consistent" CHECK (("blockedAt" IS NULL) = ("blockedReason" IS NULL));
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_blocked_reason_length" CHECK ("blockedReason" IS NULL OR char_length("blockedReason") BETWEEN 1 AND 500);

-- The guest «Усі кадри» feed: live and not hidden. The admin's feed indexes stay as they are (the
-- admin sees hidden frames).
CREATE INDEX "ContentItem_guest_feed_idx" ON "ContentItem"("collectionId", "createdAt" DESC, "id" DESC) WHERE "deletedAt" IS NULL AND "hiddenAt" IS NULL;
-- Only the guest «own» scope reads this one, so it skips hidden frames too.
DROP INDEX "ContentItem_own_idx";
CREATE INDEX "ContentItem_own_idx" ON "ContentItem"("contributorGuestSessionId", "createdAt" DESC, "id" DESC) WHERE "deletedAt" IS NULL AND "hiddenAt" IS NULL;
