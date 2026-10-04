-- Uploads and stored files (spec §7.3, §10; PR C). Prisma creates the tables and keys; the rules
-- it cannot express follow as named CHECKs and a partial index (ADR 0005).

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('INITIATED', 'COMPLETED', 'ABORTED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UploadStrategy" AS ENUM ('SINGLE', 'MULTIPART');

-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('ORIGINAL', 'THUMBNAIL', 'PREVIEW', 'POSTER');

-- CreateTable
CREATE TABLE "MediaObject" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "contentItemId" UUID NOT NULL,
    "role" "MediaRole" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "guestLinkId" UUID NOT NULL,
    "clientUploadId" UUID NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "declaredSizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "strategy" "UploadStrategy" NOT NULL,
    "multipartUploadId" TEXT,
    "partSizeBytes" BIGINT,
    "partCount" INTEGER,
    "status" "UploadStatus" NOT NULL DEFAULT 'INITIATED',
    "rejectReason" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "contentItemId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaObject_storageKey_key" ON "MediaObject"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaObject_contentItemId_role_key" ON "MediaObject"("contentItemId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_storageKey_key" ON "UploadSession"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_contentItemId_key" ON "UploadSession"("contentItemId");

-- CreateIndex
CREATE INDEX "UploadSession_status_expiresAt_idx" ON "UploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "UploadSession_collectionId_status_idx" ON "UploadSession"("collectionId", "status");

-- CreateIndex
CREATE INDEX "UploadSession_guestLinkId_idx" ON "UploadSession"("guestLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_guestSessionId_clientUploadId_key" ON "UploadSession"("guestSessionId", "clientUploadId");

-- AddForeignKey
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_session_same_collection_fkey" FOREIGN KEY ("guestSessionId", "collectionId") REFERENCES "GuestSession"("id", "collectionId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_link_same_collection_fkey" FOREIGN KEY ("guestLinkId", "collectionId") REFERENCES "GuestLink"("id", "collectionId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Only files are uploaded: a text never has an upload session.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_kind_is_file" CHECK ("kind" <> 'TEXT');

ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_size_positive" CHECK ("declaredSizeBytes" > 0);

-- A multipart upload has its storage upload id, part size and part count; a single PUT none.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_multipart_consistent" CHECK (
  ("strategy" = 'MULTIPART') =
  ("multipartUploadId" IS NOT NULL AND "partSizeBytes" IS NOT NULL AND "partCount" IS NOT NULL)
  AND ("strategy" = 'MULTIPART' OR ("multipartUploadId" IS NULL AND "partSizeBytes" IS NULL AND "partCount" IS NULL))
);

-- COMPLETED iff completedAt is set. contentItemId is not part of it: a purge later nulls it.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_completed_consistent" CHECK (
  ("status" = 'COMPLETED') = ("completedAt" IS NOT NULL)
);

-- REJECTED iff a reason is recorded.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_reject_reason" CHECK (
  ("status" = 'REJECTED') = ("rejectReason" IS NOT NULL)
);

ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_size_positive" CHECK ("sizeBytes" > 0);

-- Open uploads per guest session (the concurrency limit and quota reservations).
CREATE INDEX "UploadSession_active_idx" ON "UploadSession" ("guestSessionId") WHERE "status" = 'INITIATED';
