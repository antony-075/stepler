-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETING');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'OPERATOR', 'GUEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CollectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMPTZ(3),
    "deletionRequestedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collectionId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_ownerId_status_createdAt_id_idx" ON "Collection"("ownerId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_collectionId_createdAt_idx" ON "AuditEvent"("collectionId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_action_createdAt_idx" ON "AuditEvent"("actorId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw SQL constraints the Prisma schema cannot express (ADR 0005, spike S6).
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_title_length" CHECK (char_length("title") BETWEEN 1 AND 100);
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_description_length" CHECK ("description" IS NULL OR char_length("description") BETWEEN 1 AND 1000);
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_archived_consistent" CHECK (("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL));
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_deleting_consistent" CHECK (("status" = 'DELETING') = ("deletionRequestedAt" IS NOT NULL));
