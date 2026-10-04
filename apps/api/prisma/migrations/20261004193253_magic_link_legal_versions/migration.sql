-- The sign-in card's accepted legal versions travel on the link (ADR 0016, owner decision L1) and
-- are recorded at verify. Nullable: links issued before this migration still verify.

-- AlterTable
ALTER TABLE "MagicLinkToken" ADD COLUMN     "legalPrivacyVersion" TEXT,
ADD COLUMN     "legalTermsVersion" TEXT;

-- Registry version ids only (`LEGAL_VERSION_PATTERN` in @stepler/contracts).
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_legal_versions_format" CHECK (("legalTermsVersion" IS NULL OR "legalTermsVersion" ~ '^v[1-9][0-9]{0,3}$') AND ("legalPrivacyVersion" IS NULL OR "legalPrivacyVersion" ~ '^v[1-9][0-9]{0,3}$'));
