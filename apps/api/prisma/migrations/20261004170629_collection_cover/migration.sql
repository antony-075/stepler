-- Collection cover and welcome message (slice 8a, PR F; [A1], [A2], [A5]). Prisma creates the
-- table, columns and keys; the rules it cannot express follow as named CHECKs (ADR 0005).
-- The admin's cover file travels through the same UploadSession as guest files, with
-- `purpose = COVER` and `uploaderUserId` instead of a guest session and link (ADR 0008 addendum
-- 2026-10-04). Existing rows are all CONTENT (the default), with their guest columns set.

-- CreateEnum
CREATE TYPE "CoverStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CoverSource" AS ENUM ('UPLOAD', 'FRAME');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('CONTENT', 'COVER');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "welcomeMessage" TEXT;

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "purpose" "UploadPurpose" NOT NULL DEFAULT 'CONTENT',
ADD COLUMN     "uploaderUserId" UUID,
ALTER COLUMN "guestSessionId" DROP NOT NULL,
ALTER COLUMN "guestLinkId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CollectionCover" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "status" "CoverStatus" NOT NULL DEFAULT 'PENDING',
    "source" "CoverSource" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalSizeBytes" BIGINT NOT NULL,
    "derivedSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionCover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionCover_collectionId_key" ON "CollectionCover"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_uploaderUserId_clientUploadId_key" ON "UploadSession"("uploaderUserId", "clientUploadId");

-- AddForeignKey
ALTER TABLE "CollectionCover" ADD CONSTRAINT "CollectionCover_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1 to 160 code points when set (contract WELCOME_MESSAGE_MAX_CHARS).
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_welcome_length" CHECK (
  "welcomeMessage" IS NULL OR char_length("welcomeMessage") BETWEEN 1 AND 160
);

ALTER TABLE "CollectionCover" ADD CONSTRAINT "CollectionCover_sizes" CHECK (
  "originalSizeBytes" > 0 AND "derivedSizeBytes" >= 0
);

-- READY iff the worker recorded the source's dimensions.
ALTER TABLE "CollectionCover" ADD CONSTRAINT "CollectionCover_ready_dimensions" CHECK (
  ("status" = 'READY') = ("width" IS NOT NULL AND "height" IS NOT NULL)
);

-- A CONTENT upload has its guest session and link; a COVER upload has its uploader (and nothing of a guest).
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_purpose_actor" CHECK (
  ("purpose" = 'CONTENT') = ("guestSessionId" IS NOT NULL AND "guestLinkId" IS NOT NULL)
  AND ("purpose" = 'COVER') = ("uploaderUserId" IS NOT NULL)
);

-- A cover is always a photo.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_cover_is_photo" CHECK (
  "purpose" <> 'COVER' OR "kind" = 'PHOTO'
);
