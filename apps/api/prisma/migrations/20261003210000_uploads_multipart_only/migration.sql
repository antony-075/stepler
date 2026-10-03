-- Every upload is multipart (ADR 0008 addendum 2026-10-03, review I1): a presigned single PUT
-- stayed writable after the upload closed, while CompleteMultipartUpload and
-- AbortMultipartUpload end a multipart upload and every URL of its parts.
--
-- Single-PUT rows can only come from API tests and local trials of the unmerged upload branch
-- (no guest UI uploaded files before this). They cannot satisfy the new NOT NULL columns, so they
-- go; a completed one's content item stays (its key is in its MediaObject row).
DELETE FROM "UploadSession" WHERE "strategy" = 'SINGLE';

ALTER TABLE "UploadSession" DROP CONSTRAINT "UploadSession_multipart_consistent";

-- AlterTable
ALTER TABLE "UploadSession" DROP COLUMN "strategy",
ALTER COLUMN "multipartUploadId" SET NOT NULL,
ALTER COLUMN "partSizeBytes" SET NOT NULL,
ALTER COLUMN "partCount" SET NOT NULL;

-- DropEnum
DROP TYPE "UploadStrategy";

ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_parts_positive" CHECK (
  "partSizeBytes" > 0 AND "partCount" >= 1
);
