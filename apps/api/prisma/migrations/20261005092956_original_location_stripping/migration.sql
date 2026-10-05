-- Location stripping (ADR 0008 addendum 2026-10-05): the worker removes location metadata from
-- photo and video originals, and from admin image originals, once, before their previews.
-- `sanitizedAt` records it, `sanitizeFailedAt` that the worker gave up; both NULL means not yet
-- (every existing row: the maintenance sweep queues them, see the addendum). Additive only: no
-- existing row or rule changes.

-- AlterTable
ALTER TABLE "CollectionImage" ADD COLUMN     "sanitizeFailedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sanitizedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "sanitizeFailedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sanitizedAt" TIMESTAMPTZ(3);

-- Only files are sanitised; texts and documents never are.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_sanitized_media_only" CHECK (("sanitizedAt" IS NULL AND "sanitizeFailedAt" IS NULL) OR "kind" IN ('PHOTO', 'VIDEO'));
-- One outcome at most.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_sanitize_outcome" CHECK ("sanitizedAt" IS NULL OR "sanitizeFailedAt" IS NULL);
ALTER TABLE "CollectionImage" ADD CONSTRAINT "CollectionImage_sanitize_outcome" CHECK ("sanitizedAt" IS NULL OR "sanitizeFailedAt" IS NULL);

-- The sweep's backfill: live READY photos and videos with no outcome yet. New uploads are
-- sanitised while PENDING, so once the backfill has caught up this index is empty.
CREATE INDEX "ContentItem_unsanitized_idx" ON "ContentItem"("createdAt") WHERE "sanitizedAt" IS NULL AND "sanitizeFailedAt" IS NULL AND "processingStatus" = 'READY' AND "kind" IN ('PHOTO', 'VIDEO') AND "deletedAt" IS NULL;
