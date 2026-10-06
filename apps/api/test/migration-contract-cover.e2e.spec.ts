import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { TEST_DATABASE_URL } from './support/env.js';

// The contract step (plan Task 25): slice 8a data is seeded before PR I's migration, PR I and the
// migrations after it run, the admin works with the new model for a while (a cover replaced, a
// welcome edited), then the contraction runs. Its guards are checked on databases they must
// refuse: each is left exactly as it was.

const MIGRATIONS = new URL('../prisma/migrations/', import.meta.url);
const PR_I = '20261005072838_guest_page_templates';
const THIS_ONE = '_drop_slice_8a_cover';

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const prI = folders.indexOf(PR_I);
const index = folders.findIndex((name) => name.endsWith(THIS_ONE));
const sql = (folder: string) =>
  readFileSync(new URL(`${folder}/migration.sql`, MIGRATIONS), 'utf8');

const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
const clients: pg.Client[] = [];
const databases: string[] = [];
let connected = false;

afterAll(async () => {
  for (const client of clients) await client.end();
  for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  if (connected) await admin.end();
});

const one = async <T>(client: pg.Client, text: string, values: unknown[] = []) =>
  (await client.query(text, values)).rows[0] as T;

/** Seeded ids, for the checks after the migration. */
interface Seeded {
  client: pg.Client;
  ownerId: string;
  dressed: string;
  bare: string;
  replaced: string;
  kept: string;
  stale: string;
}

/**
 * A scratch database with slice 8a data (two covers, two welcomes and a cover upload), migrated
 * through PR I (recorded in `_prisma_migrations` as Prisma does) and every migration up to this
 * one; then one cover is replaced in the new model, so its old row is stale.
 */
async function prepared(): Promise<Seeded> {
  if (!connected) {
    await admin.connect();
    connected = true;
  }
  const name = `stepler_contract_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  databases.push(name);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  clients.push(client);
  for (const folder of folders.slice(0, prI)) await client.query(sql(folder));

  const { id: ownerId } = await one<{ id: string }>(
    client,
    `INSERT INTO "User" ("email", "updatedAt") VALUES ('olena@example.com', now()) RETURNING "id"::text`,
  );
  const collection = async (title: string, welcome: string | null) =>
    (
      await one<{ id: string }>(
        client,
        `INSERT INTO "Collection" ("ownerId", "title", "welcomeMessage", "updatedAt")
         VALUES ($1, $2, $3, now()) RETURNING "id"::text`,
        [ownerId, title, welcome],
      )
    ).id;
  const cover = async (collectionId: string) =>
    (
      await one<{ id: string }>(
        client,
        `INSERT INTO "CollectionCover"
           ("collectionId", "status", "source", "mimeType", "originalSizeBytes",
            "derivedSizeBytes", "width", "height")
         VALUES ($1, 'READY', 'UPLOAD', 'image/jpeg', 1000, 500, 4000, 3000)
         RETURNING "id"::text`,
        [collectionId],
      )
    ).id;
  const dressed = await collection('Весілля', 'Дякуємо, що ви з нами!');
  const bare = await collection('Ювілей', null);
  const kept = await cover(dressed);
  const stale = await cover(bare);
  await client.query(
    `INSERT INTO "UploadSession"
       ("collectionId", "purpose", "uploaderUserId", "clientUploadId", "kind",
        "originalFilename", "declaredMime", "declaredSizeBytes", "storageKey",
        "multipartUploadId", "partSizeBytes", "partCount", "expiresAt")
     VALUES ($1::uuid, 'COVER', $2::uuid, gen_random_uuid(), 'PHOTO', 'c.jpg', 'image/jpeg', 1000,
             'collections/' || $1::text || '/uploads/x/original', 'mp', 5242880, 1,
             now() + interval '1 day')`,
    [dressed, ownerId],
  );

  await client.query(`
    CREATE TABLE "_prisma_migrations" (
      "migration_name" text PRIMARY KEY,
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "finished_at" timestamptz,
      "rolled_back_at" timestamptz
    )`);
  await client.query(
    `INSERT INTO "_prisma_migrations" ("migration_name", "started_at") VALUES ($1, clock_timestamp())`,
    [PR_I],
  );
  await client.query(sql(PR_I));
  await client.query(
    `UPDATE "_prisma_migrations" SET "finished_at" = clock_timestamp() WHERE "migration_name" = $1`,
    [PR_I],
  );
  for (const folder of folders.slice(prI + 1, index)) await client.query(sql(folder));

  // After PR I: the bare collection's cover is replaced (the collector deleted the old image) and
  // the dressed collection's welcome is edited in its guest page.
  const { id: replaced } = await one<{ id: string }>(
    client,
    `INSERT INTO "CollectionImage" ("collectionId", "slot", "status", "source", "mimeType", "originalSizeBytes")
     VALUES ($1, 'COVER', 'PENDING', 'UPLOAD', 'image/png', 2000) RETURNING "id"::text`,
    [bare],
  );
  await client.query(
    `UPDATE "GuestPageVersion" SET "coverImageId" = $2 WHERE "collectionId" = $1 AND "state" = 'PUBLISHED'`,
    [bare, replaced],
  );
  await client.query(`DELETE FROM "CollectionImage" WHERE "id" = $1`, [stale]);
  await client.query(
    `UPDATE "GuestPageVersion" SET "welcomeMessage" = 'Ласкаво просимо!' WHERE "collectionId" = $1`,
    [dressed],
  );
  return { client, ownerId, dressed, bare, replaced, kept, stale };
}

const oldTableExists = async (client: pg.Client) =>
  (
    await one<{ name: string | null }>(
      client,
      `SELECT to_regclass('"CollectionCover"')::text AS "name"`,
    )
  ).name !== null;

describe('contract migration (drop the slice 8a cover table and welcome column)', () => {
  test('drops the old table, enums and column; the new model keeps every cover and welcome', async () => {
    expect(prI).toBeGreaterThan(0);
    expect(index).toBeGreaterThan(prI);
    const { client, dressed, bare, replaced, kept } = await prepared();

    await client.query(sql(folders[index]!));

    expect(await oldTableExists(client)).toBe(false);
    expect(
      (
        await client.query(
          `SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Collection' AND column_name = 'welcomeMessage'`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await client.query(`SELECT 1 FROM pg_type WHERE typname IN ('CoverStatus', 'CoverSource')`))
        .rows,
    ).toEqual([]);

    const pages = await client.query<{
      collectionId: string;
      welcome: string | null;
      cover: string | null;
    }>(
      `SELECT "collectionId"::text, "welcomeMessage" AS "welcome", "coverImageId"::text AS "cover"
         FROM "GuestPageVersion" WHERE "state" = 'PUBLISHED' ORDER BY "createdAt", "id"`,
    );
    expect(new Map(pages.rows.map((row) => [row.collectionId, row]))).toEqual(
      new Map([
        [dressed, { collectionId: dressed, welcome: 'Ласкаво просимо!', cover: kept }],
        [bare, { collectionId: bare, welcome: null, cover: replaced }],
      ]),
    );
    const images = await client.query(
      `SELECT "id"::text, "slot"::text, "status"::text, "width" FROM "CollectionImage" ORDER BY "createdAt", "id"`,
    );
    expect(images.rows).toEqual([
      { id: kept, slot: 'COVER', status: 'READY', width: 4000 },
      { id: replaced, slot: 'COVER', status: 'PENDING', width: null },
    ]);
    // The cover upload from before PR I keeps its target (LEGACY_COVER stays).
    expect(
      (await client.query(`SELECT "imageTarget"::text AS "target" FROM "UploadSession"`)).rows,
    ).toEqual([{ target: 'LEGACY_COVER' }]);
  });

  test('refuses a cover row written after the backfill, and changes nothing', async () => {
    const { client, bare } = await prepared();
    await client.query(
      `INSERT INTO "CollectionCover" ("id", "collectionId", "status", "source", "mimeType", "originalSizeBytes")
       VALUES (gen_random_uuid(), $1, 'PENDING', 'UPLOAD', 'image/jpeg', 10)
       ON CONFLICT ("collectionId") DO UPDATE SET "createdAt" = now()`,
      [bare],
    );
    await expect(client.query(sql(folders[index]!))).rejects.toThrow(/written after the backfill/);
    expect(await oldTableExists(client)).toBe(true);
  });

  test('refuses a collection without its published guest page', async () => {
    const { client, ownerId } = await prepared();
    await client.query(
      `INSERT INTO "Collection" ("ownerId", "title", "updatedAt") VALUES ($1, 'Без сторінки', now())`,
      [ownerId],
    );
    await expect(client.query(sql(folders[index]!))).rejects.toThrow(/no published guest page/);
    expect(await oldTableExists(client)).toBe(true);
  });

  test('refuses while slice 8a cover jobs are still queued', async () => {
    const { client, dressed, kept } = await prepared();
    // The two columns of pg-boss's job table the guard reads.
    await client.query(`CREATE SCHEMA pgboss`);
    await client.query(
      `CREATE TABLE pgboss.job ("name" text NOT NULL, "state" text NOT NULL, "data" jsonb)`,
    );
    await client.query(
      `INSERT INTO pgboss.job VALUES ('cover.purge', 'completed', '{}'),
                                     ('media.cover-derivatives', 'retry', $1)`,
      [JSON.stringify({ collectionId: dressed, coverId: kept })],
    );
    await expect(client.query(sql(folders[index]!))).rejects.toThrow(/still queued/);
    expect(await oldTableExists(client)).toBe(true);

    await client.query(`UPDATE pgboss.job SET "state" = 'completed'`);
    await client.query(sql(folders[index]!));
    expect(await oldTableExists(client)).toBe(false);
  });
});
