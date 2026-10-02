-- Split "canUploadFiles" into photos, videos and documents (owner, 2026-10-02). Every existing
-- link keeps what it allowed: all three take the old value.

-- AlterTable: add the columns, copy, then require them.
ALTER TABLE "GuestLink" ADD COLUMN "canUploadPhotos" BOOLEAN,
ADD COLUMN "canUploadVideos" BOOLEAN,
ADD COLUMN "canUploadDocuments" BOOLEAN;

UPDATE "GuestLink"
SET "canUploadPhotos" = "canUploadFiles",
    "canUploadVideos" = "canUploadFiles",
    "canUploadDocuments" = "canUploadFiles";

ALTER TABLE "GuestLink" ALTER COLUMN "canUploadPhotos" SET NOT NULL,
ALTER COLUMN "canUploadVideos" SET NOT NULL,
ALTER COLUMN "canUploadDocuments" SET NOT NULL;

-- The two CHECKs that read the old column, rewritten for the new ones (same names).
ALTER TABLE "GuestLink" DROP CONSTRAINT "GuestLink_has_capability";
ALTER TABLE "GuestLink" DROP CONSTRAINT "GuestLink_delete_own_needs_contribution";
ALTER TABLE "GuestLink" DROP COLUMN "canUploadFiles";
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_has_capability" CHECK ("canUploadPhotos" OR "canUploadVideos" OR "canUploadDocuments" OR "canSubmitText" OR "canViewGallery");
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_delete_own_needs_contribution" CHECK (NOT "canDeleteOwn" OR "canUploadPhotos" OR "canUploadVideos" OR "canUploadDocuments" OR "canSubmitText");
