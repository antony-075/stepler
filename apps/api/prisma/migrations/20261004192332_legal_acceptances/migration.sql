-- Legal acceptance (slice 10, ADR 0016): one row per user, document and accepted version. No IP
-- address (owner decision L2); the request id correlates the row with the request log.

-- CreateEnum
CREATE TYPE "LegalDocument" AS ENUM ('TERMS', 'PRIVACY');

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "document" "LegalDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_document_version_key" ON "LegalAcceptance"("userId", "document", "version");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Versions are the registry's ids (`LEGAL_VERSION_PATTERN` in @stepler/contracts): v1…v9999.
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_version_format" CHECK ("version" ~ '^v[1-9][0-9]{0,3}$');
