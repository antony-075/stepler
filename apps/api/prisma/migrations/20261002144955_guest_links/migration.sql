-- CreateEnum
CREATE TYPE "GuestLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "GuestLink" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL,
    "label" TEXT,
    "status" "GuestLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT,
    "tokenKeyId" TEXT,
    "canUploadFiles" BOOLEAN NOT NULL,
    "canSubmitText" BOOLEAN NOT NULL,
    "canViewGallery" BOOLEAN NOT NULL,
    "canDeleteOwn" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuestLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestLink_replacedById_key" ON "GuestLink"("replacedById");

-- CreateIndex
CREATE UNIQUE INDEX "GuestLink_tokenHash_key" ON "GuestLink"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestLink_collectionId_isDefault_status_createdAt_idx" ON "GuestLink"("collectionId", "isDefault", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "GuestLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw SQL constraints the Prisma schema cannot express (ADR 0005, spike S6).
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_has_capability" CHECK ("canUploadFiles" OR "canSubmitText" OR "canViewGallery");
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_delete_own_needs_contribution" CHECK (NOT "canDeleteOwn" OR "canUploadFiles" OR "canSubmitText");
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_revoked_consistent" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL));
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_ciphertext_while_live" CHECK ((("status" = 'REVOKED') = ("tokenCiphertext" IS NULL)) AND (("tokenCiphertext" IS NULL) = ("tokenKeyId" IS NULL)));
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_replaced_only_revoked" CHECK ("replacedById" IS NULL OR "status" = 'REVOKED');
ALTER TABLE "GuestLink" ADD CONSTRAINT "GuestLink_label_rules" CHECK (("label" IS NULL OR char_length("label") BETWEEN 1 AND 60) AND (NOT "isDefault" OR "label" IS NULL) AND ("isDefault" OR "label" IS NOT NULL));
CREATE UNIQUE INDEX "GuestLink_one_live_default" ON "GuestLink"("collectionId") WHERE "isDefault" AND "status" <> 'REVOKED';
