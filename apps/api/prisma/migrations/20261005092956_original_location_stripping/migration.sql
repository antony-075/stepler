-- Location stripping (ADR 0008 addendum 2026-10-05): the worker removes location metadata from
-- photo and video originals, and from admin image originals, once, before their previews.
-- `sanitizedAt` records it; NULL means not yet (every existing row: the maintenance sweep
-- queues them, see the addendum). Additive only: no existing row or rule changes.

-- AlterTable
ALTER TABLE "CollectionImage" ADD COLUMN     "sanitizedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "sanitizedAt" TIMESTAMPTZ(3);

-- Only files are sanitised; texts and documents never are.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_sanitized_media_only" CHECK ("sanitizedAt" IS NULL OR "kind" IN ('PHOTO', 'VIDEO'));

-- The sweep's backfill: live photos and videos not sanitised yet (empty once it has caught up).
CREATE INDEX "ContentItem_unsanitized_idx" ON "ContentItem"("createdAt") WHERE "sanitizedAt" IS NULL AND "kind" IN ('PHOTO', 'VIDEO') AND "deletedAt" IS NULL;
