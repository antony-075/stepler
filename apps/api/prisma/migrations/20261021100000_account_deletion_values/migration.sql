-- Self-service account deletion (ADR 0020), step 1: the new enum values. Their own migration,
-- because PostgreSQL cannot use a value added in the same transaction (the CHECK in step 2).

-- AlterEnum
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'DELETE_ACCOUNT';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';
