-- E-mail + password sign-in (ADR 0019): the password hash, the mailed verification/reset tokens.
-- The magic-link sign-in goes away with its table (only short-lived, single-use rows).

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- DropTable
DROP TABLE "MagicLinkToken";

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthEmailToken" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "requestIpHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthEmailToken_tokenHash_key" ON "AuthEmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthEmailToken_userId_purpose_createdAt_idx" ON "AuthEmailToken"("userId", "purpose", "createdAt");

-- AddForeignKey
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthEmailToken" ADD CONSTRAINT "AuthEmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only Argon2id PHC strings, never a plain or other-algorithm value.
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_argon2id" CHECK ("passwordHash" LIKE '$argon2id$%');
