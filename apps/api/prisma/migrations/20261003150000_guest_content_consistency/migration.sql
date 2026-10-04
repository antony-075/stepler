-- Collection consistency in PostgreSQL (review of PR A): a session's current link, and an item's
-- session, belong to the row's own collection. Composite keys replace the single-column ones.
-- The item's key nulls only the session column when its session row goes (PostgreSQL 15+): the
-- item stays in its collection. Prisma models it as SetNull (a schema warning, since
-- "collectionId" is required); the column list exists only here.

-- DropForeignKey
ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_contributorGuestSessionId_fkey";

-- DropForeignKey
ALTER TABLE "GuestSession" DROP CONSTRAINT "GuestSession_currentLinkId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "GuestLink_id_collectionId_key" ON "GuestLink"("id", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_id_collectionId_key" ON "GuestSession"("id", "collectionId");

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_link_same_collection_fkey" FOREIGN KEY ("currentLinkId", "collectionId") REFERENCES "GuestLink"("id", "collectionId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_session_same_collection_fkey" FOREIGN KEY ("contributorGuestSessionId", "collectionId") REFERENCES "GuestSession"("id", "collectionId") ON DELETE SET NULL ("contributorGuestSessionId") ON UPDATE NO ACTION;

