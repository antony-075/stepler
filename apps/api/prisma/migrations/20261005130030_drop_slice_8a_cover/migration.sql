-- Guest page templates, contract step (plan Task 25, ADR 0017): the slice 8a cover table, its
-- enums and the welcome column go. Since PR I (`20261005072838_guest_page_templates`) nothing
-- reads or writes them: covers are `CollectionImage` rows (same ids) and the welcome is the
-- guest page version's. The enum value `ImageUploadTarget.LEGACY_COVER` stays: every cover
-- upload from before PR I still carries it (schema.prisma says why).
--
-- The guards run first, so a database they refuse is left untouched.
DO $$
DECLARE
  backfilled timestamptz;
  legacy_jobs boolean;
BEGIN
  -- Every collection has the published guest page the backfill (or its creation) gave it.
  IF EXISTS (
    SELECT 1 FROM "Collection" AS c
    WHERE NOT EXISTS (
      SELECT 1 FROM "GuestPageVersion" AS v
      WHERE v."collectionId" = c."id" AND v."state" = 'PUBLISHED'
    )
  ) THEN
    RAISE EXCEPTION 'drop_slice_8a_cover: a collection has no published guest page; the PR I backfill did not run';
  END IF;

  -- A cover still in use was copied with its id, its collection and the COVER slot. (A cover
  -- replaced or removed since PR I has no image any more: the image collector deleted it.)
  IF EXISTS (
    SELECT 1 FROM "CollectionCover" AS cover
    JOIN "CollectionImage" AS image ON image."id" = cover."id"
    WHERE image."collectionId" <> cover."collectionId" OR image."slot" <> 'COVER'
  ) THEN
    RAISE EXCEPTION 'drop_slice_8a_cover: a cover was copied into the wrong collection or slot';
  END IF;

  -- Nothing wrote the old table or column after the backfill. It ran inside the migration that
  -- created the new tables, so every row from before it was copied; a younger row was not.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    SELECT "started_at" INTO backfilled FROM "_prisma_migrations"
    WHERE "migration_name" = '20261005072838_guest_page_templates'
      AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;
    IF backfilled IS NULL THEN
      RAISE EXCEPTION 'drop_slice_8a_cover: 20261005072838_guest_page_templates is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM "CollectionCover" WHERE "createdAt" >= backfilled)
      OR EXISTS (
        SELECT 1 FROM "Collection"
        WHERE "welcomeMessage" IS NOT NULL AND "createdAt" >= backfilled
      )
    THEN
      RAISE EXCEPTION 'drop_slice_8a_cover: the old cover table or welcome column was written after the backfill';
    END IF;
  END IF;

  -- The worker no longer serves the slice 8a job names, so none may still be waiting: let a
  -- worker of PR I or later drain the queue first (staging release notes). Dynamic SQL, because
  -- a database pg-boss never started has no such table.
  IF to_regclass('pgboss.job') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM pgboss.job
        WHERE name IN ('media.cover-derivatives', 'cover.purge')
          AND state IN ('created', 'retry', 'active')
      )
    $q$ INTO legacy_jobs;
    IF legacy_jobs THEN
      RAISE EXCEPTION 'drop_slice_8a_cover: slice 8a cover jobs are still queued; run the PR I worker until they are done';
    END IF;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "CollectionCover" DROP CONSTRAINT "CollectionCover_collectionId_fkey";

-- AlterTable
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_welcome_length";
ALTER TABLE "Collection" DROP COLUMN "welcomeMessage";

-- DropTable (its CHECKs "CollectionCover_sizes" and "CollectionCover_ready_dimensions" with it)
DROP TABLE "CollectionCover";

-- DropEnum
DROP TYPE "CoverSource";

-- DropEnum
DROP TYPE "CoverStatus";
