-- Guest page templates (plan 2026-10-05 Task 6, ADR 0017): admin images by slot, guest page
-- versions (one PUBLISHED, at most one DRAFT per collection) and the admin-only collection image.
-- Expand step: CollectionCover and Collection.welcomeMessage stay until PR L; their data is
-- copied here, covers with the same ids so their storage keys stay valid. Prisma creates the
-- tables, columns and keys; the rules it cannot express follow as named CHECKs (ADR 0005).

-- CreateEnum
CREATE TYPE "ImageSlot" AS ENUM ('COVER', 'BACKGROUND', 'COLLECTION_IMAGE');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ImageSource" AS ENUM ('UPLOAD', 'FRAME');

-- CreateEnum
CREATE TYPE "GuestPageVersionState" AS ENUM ('PUBLISHED', 'DRAFT');

-- CreateEnum
CREATE TYPE "ImageUploadTarget" AS ENUM ('DRAFT', 'LEGACY_COVER', 'COLLECTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UploadPurpose" ADD VALUE 'BACKGROUND';
ALTER TYPE "UploadPurpose" ADD VALUE 'COLLECTION_IMAGE';

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "imageId" UUID,
ADD COLUMN     "lastPageRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "imageTarget" "ImageUploadTarget";

-- CreateTable
CREATE TABLE "CollectionImage" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "slot" "ImageSlot" NOT NULL,
    "status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "source" "ImageSource" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalSizeBytes" BIGINT NOT NULL,
    "derivedSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestPageVersion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "state" "GuestPageVersionState" NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "welcomeMessage" TEXT,
    "coverImageId" UUID,
    "backgroundImageId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "savedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuestPageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionImage_collectionId_slot_idx" ON "CollectionImage"("collectionId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionImage_id_collectionId_key" ON "CollectionImage"("id", "collectionId");

-- CreateIndex
CREATE INDEX "GuestPageVersion_coverImageId_idx" ON "GuestPageVersion"("coverImageId");

-- CreateIndex
CREATE INDEX "GuestPageVersion_backgroundImageId_idx" ON "GuestPageVersion"("backgroundImageId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestPageVersion_collectionId_state_key" ON "GuestPageVersion"("collectionId", "state");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_image_same_collection_fkey" FOREIGN KEY ("imageId", "id") REFERENCES "CollectionImage"("id", "collectionId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CollectionImage" ADD CONSTRAINT "CollectionImage_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_cover_same_collection_fkey" FOREIGN KEY ("coverImageId", "collectionId") REFERENCES "CollectionImage"("id", "collectionId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_background_same_collection_fkey" FOREIGN KEY ("backgroundImageId", "collectionId") REFERENCES "CollectionImage"("id", "collectionId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 'BACKGROUND' and 'COLLECTION_IMAGE' are not used below: a value added to an enum cannot be
-- used in the same transaction.

ALTER TABLE "CollectionImage" ADD CONSTRAINT "CollectionImage_sizes" CHECK (
  "originalSizeBytes" > 0 AND "derivedSizeBytes" >= 0
);

-- READY iff the worker recorded the source's dimensions.
ALTER TABLE "CollectionImage" ADD CONSTRAINT "CollectionImage_ready_dimensions" CHECK (
  ("status" = 'READY') = ("width" IS NOT NULL AND "height" IS NOT NULL)
);

-- A stable slug, as the contract's templateIdSchema.
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_template_id" CHECK (
  "templateId" ~ '^[a-z][a-z0-9-]{0,39}$'
);

ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_numbers" CHECK (
  "templateVersion" >= 1 AND "revision" >= 1
);

-- The template's definition validates the shape; the database only refuses a non-object.
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_settings_object" CHECK (
  jsonb_typeof("settings") = 'object'
);

-- 1 to 160 code points when set (contract WELCOME_MESSAGE_MAX_CHARS), as Collection_welcome_length.
ALTER TABLE "GuestPageVersion" ADD CONSTRAINT "GuestPageVersion_welcome_length" CHECK (
  "welcomeMessage" IS NULL OR char_length("welcomeMessage") BETWEEN 1 AND 160
);

-- A CONTENT upload has its guest session and link; an admin image upload (every other purpose)
-- has its uploader, and nothing of a guest.
ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_purpose_actor";
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_purpose_actor" CHECK (
  ("purpose" = 'CONTENT') = ("guestSessionId" IS NOT NULL AND "guestLinkId" IS NOT NULL)
  AND ("purpose" <> 'CONTENT') = ("uploaderUserId" IS NOT NULL)
);

-- Open COVER uploads from before the upgrade came through the slice 8a routes.
UPDATE "UploadSession" SET "imageTarget" = 'LEGACY_COVER' WHERE "purpose" = 'COVER';

-- An admin image upload knows what it completes into; a guest upload has no such target.
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_image_target" CHECK (
  ("purpose" = 'CONTENT') = ("imageTarget" IS NULL)
);

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_page_revision_positive" CHECK (
  "lastPageRevision" >= 1
);

-- An admin image is always a photo.
ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_cover_is_photo";
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_admin_image_is_photo" CHECK (
  "purpose" = 'CONTENT' OR "kind" = 'PHOTO'
);

-- Backfill 1: every cover becomes a COVER image with the same id (its keys stay valid).
INSERT INTO "CollectionImage" (
  "id", "collectionId", "slot", "status", "source", "mimeType",
  "originalSizeBytes", "derivedSizeBytes", "width", "height", "createdAt"
)
SELECT
  "id", "collectionId", 'COVER', "status"::text::"ImageStatus", "source"::text::"ImageSource",
  "mimeType", "originalSizeBytes", "derivedSizeBytes", "width", "height", "createdAt"
FROM "CollectionCover";

-- Backfill 2: one PUBLISHED page per collection: `classic` v1 with its defaults (the literal
-- of @stepler/templates' classic.defaults; a test compares them), the welcome and the cover.
INSERT INTO "GuestPageVersion" (
  "collectionId", "state", "templateId", "templateVersion", "settings", "welcomeMessage",
  "coverImageId", "updatedAt"
)
SELECT
  k."id", 'PUBLISHED', 'classic', 1,
  '{"background":{"kind":"solid","color":"#F0F1EE"},"accent":"#B83E26","headingFont":"geologica","coverPlacement":"top","align":"start","corners":"soft"}'::jsonb,
  k."welcomeMessage", c."id", CURRENT_TIMESTAMP
FROM "Collection" k
LEFT JOIN "CollectionCover" c ON c."collectionId" = k."id";
