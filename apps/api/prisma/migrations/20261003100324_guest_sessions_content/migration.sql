-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT', 'TEXT');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "nextFrameNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "currentLinkId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "contributorName" TEXT,
    "nameAnsweredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "frameNo" INTEGER NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "contributorGuestSessionId" UUID,
    "contributorName" TEXT,
    "originalFilename" TEXT,
    "textBody" TEXT,
    "idempotencyKey" UUID,
    "processingStatus" "ProcessingStatus" NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_collectionId_idx" ON "GuestSession"("collectionId");

-- CreateIndex
CREATE INDEX "GuestSession_currentLinkId_idx" ON "GuestSession"("currentLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_collectionId_frameNo_key" ON "ContentItem"("collectionId", "frameNo");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_contributorGuestSessionId_idempotencyKey_key" ON "ContentItem"("contributorGuestSessionId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_currentLinkId_fkey" FOREIGN KEY ("currentLinkId") REFERENCES "GuestLink"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_contributorGuestSessionId_fkey" FOREIGN KEY ("contributorGuestSessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw SQL constraints and partial indexes the Prisma schema cannot express (ADR 0005).
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_next_frame_positive" CHECK ("nextFrameNo" > 0);
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_name_length" CHECK ("contributorName" IS NULL OR char_length("contributorName") BETWEEN 1 AND 80);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_text_consistent" CHECK (("kind" = 'TEXT') = ("textBody" IS NOT NULL));
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_text_length" CHECK ("textBody" IS NULL OR char_length("textBody") BETWEEN 1 AND 5000);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_name_length" CHECK ("contributorName" IS NULL OR char_length("contributorName") BETWEEN 1 AND 80);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_frame_positive" CHECK ("frameNo" > 0);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_processing_by_kind" CHECK (("kind" IN ('TEXT', 'DOCUMENT')) = ("processingStatus" = 'NOT_REQUIRED'));
-- Admin and shared-gallery feeds, newest first [C5], with and without a kind filter.
CREATE INDEX "ContentItem_feed_idx" ON "ContentItem"("collectionId", "createdAt" DESC, "id" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX "ContentItem_feed_kind_idx" ON "ContentItem"("collectionId", "kind", "createdAt" DESC, "id" DESC) WHERE "deletedAt" IS NULL;
-- A guest's own frames.
CREATE INDEX "ContentItem_own_idx" ON "ContentItem"("contributorGuestSessionId", "createdAt" DESC, "id" DESC) WHERE "deletedAt" IS NULL;
-- The purge sweep.
CREATE INDEX "ContentItem_deleted_idx" ON "ContentItem"("deletedAt") WHERE "deletedAt" IS NOT NULL;
