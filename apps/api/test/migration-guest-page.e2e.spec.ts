import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { definitionOf } from '@stepler/templates/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { TEST_DATABASE_URL } from './support/env.js';

// The guest page templates migration on a database that holds slice 8a data (plan Task 6): every
// migration before it is applied to a scratch database, a cover and a welcome are seeded, then
// this one runs and its backfill is checked.

const MIGRATIONS = new URL('../prisma/migrations/', import.meta.url);
const THIS_ONE = '_guest_page_templates';

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const index = folders.findIndex((name) => name.endsWith(THIS_ONE));
const sql = (folder: string) =>
  readFileSync(new URL(`${folder}/migration.sql`, MIGRATIONS), 'utf8');

const database = `stepler_migration_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const url = new URL(TEST_DATABASE_URL);
const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
let client: pg.Client;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  url.pathname = `/${database}`;
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  for (const folder of folders.slice(0, index)) await client.query(sql(folder));
});

afterAll(async () => {
  await client?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
});

describe('guest page templates migration', () => {
  test('backfills one published classic page per collection (any status), with the welcome and the cover', async () => {
    expect(index).toBeGreaterThan(0);
    const [{ id: ownerId }] = (
      await client.query<{ id: string }>(
        `INSERT INTO "User" ("email", "updatedAt") VALUES ('olena@example.com', now()) RETURNING "id"::text`,
      )
    ).rows as [{ id: string }];
    const insertCollection = async (
      title: string,
      welcome: string | null,
      status: 'ACTIVE' | 'ARCHIVED' | 'DELETING' = 'ACTIVE',
    ) =>
      (
        (
          await client.query<{ id: string }>(
            `INSERT INTO "Collection"
               ("ownerId", "title", "welcomeMessage", "status", "archivedAt", "deletionRequestedAt", "updatedAt")
             VALUES ($1, $2, $3, $4::"CollectionStatus",
                     CASE WHEN $4 = 'ARCHIVED' THEN now() END,
                     CASE WHEN $4 = 'DELETING' THEN now() END, now())
             RETURNING "id"::text`,
            [ownerId, title, welcome, status],
          )
        ).rows[0] as { id: string }
      ).id;
    const insertCover = async (collectionId: string, status: 'PENDING' | 'FAILED') =>
      (
        (
          await client.query<{ id: string }>(
            `INSERT INTO "CollectionCover"
               ("collectionId", "status", "source", "mimeType", "originalSizeBytes")
             VALUES ($1, $2::"CoverStatus", 'UPLOAD', 'image/png', 2000)
             RETURNING "id"::text`,
            [collectionId, status],
          )
        ).rows[0] as { id: string }
      ).id;
    const dressed = await insertCollection('Весілля', 'Дякуємо, що ви з нами!');
    const bare = await insertCollection('Ювілей', null);
    const archived = await insertCollection('Архів', 'Дякуємо!', 'ARCHIVED');
    const deleting = await insertCollection('Видаляється', null, 'DELETING');
    const pendingCover = await insertCover(archived, 'PENDING');
    const failedCover = await insertCover(deleting, 'FAILED');
    const cover = (
      (
        await client.query<{ id: string }>(
          `INSERT INTO "CollectionCover"
             ("collectionId", "status", "source", "mimeType", "originalSizeBytes",
              "derivedSizeBytes", "width", "height")
           VALUES ($1, 'READY', 'FRAME', 'image/jpeg', 1000, 500, 4000, 3000)
           RETURNING "id"::text`,
          [dressed],
        )
      ).rows[0] as { id: string }
    ).id;

    // An admin cover upload still open across the upgrade (the slice 8a route).
    await client.query(
      `INSERT INTO "UploadSession"
         ("collectionId", "purpose", "uploaderUserId", "clientUploadId", "kind",
          "originalFilename", "declaredMime", "declaredSizeBytes", "storageKey",
          "multipartUploadId", "partSizeBytes", "partCount", "expiresAt")
       VALUES ($1::uuid, 'COVER', $2::uuid, gen_random_uuid(), 'PHOTO', 'c.jpg', 'image/jpeg', 1000,
               'collections/' || $1::text || '/uploads/x/original', 'mp', 5242880, 1, now() + interval '1 day')`,
      [bare, ownerId],
    );

    await client.query(sql(folders[index]!));

    const versions = await client.query<{
      collectionId: string;
      state: string;
      templateId: string;
      templateVersion: number;
      settings: unknown;
      welcomeMessage: string | null;
      coverImageId: string | null;
      backgroundImageId: string | null;
      revision: number;
    }>(
      `SELECT "collectionId"::text, "state", "templateId", "templateVersion", "settings",
              "welcomeMessage", "coverImageId"::text, "backgroundImageId"::text, "revision"
         FROM "GuestPageVersion" ORDER BY "createdAt", "id"`,
    );
    const byCollection = new Map(versions.rows.map((row) => [row.collectionId, row]));
    expect(versions.rows).toHaveLength(4);
    expect(byCollection.get(archived)).toMatchObject({
      state: 'PUBLISHED',
      welcomeMessage: 'Дякуємо!',
      coverImageId: pendingCover,
    });
    expect(byCollection.get(deleting)).toMatchObject({ coverImageId: failedCover });
    const classic = definitionOf('classic')!;
    expect(byCollection.get(dressed)).toEqual({
      collectionId: dressed,
      state: 'PUBLISHED',
      templateId: 'classic',
      templateVersion: classic.version,
      settings: classic.defaults,
      welcomeMessage: 'Дякуємо, що ви з нами!',
      coverImageId: cover,
      backgroundImageId: null,
      revision: 1,
    });
    expect(byCollection.get(bare)).toMatchObject({
      state: 'PUBLISHED',
      settings: classic.defaults,
      welcomeMessage: null,
      coverImageId: null,
    });

    const images = await client.query(
      `SELECT "id"::text, "collectionId"::text, "slot", "status", "source", "mimeType",
              "originalSizeBytes"::int, "derivedSizeBytes"::int, "width", "height"
         FROM "CollectionImage" WHERE "collectionId" = $1`,
      [dressed],
    );
    const others = await client.query(
      `SELECT "id"::text, "slot", "status", "width" FROM "CollectionImage"
        WHERE "collectionId" <> $1 ORDER BY "status"`,
      [dressed],
    );
    expect(others.rows).toEqual([
      { id: pendingCover, slot: 'COVER', status: 'PENDING', width: null },
      { id: failedCover, slot: 'COVER', status: 'FAILED', width: null },
    ]);
    expect(images.rows).toEqual([
      {
        id: cover,
        collectionId: dressed,
        slot: 'COVER',
        status: 'READY',
        source: 'FRAME',
        mimeType: 'image/jpeg',
        originalSizeBytes: 1000,
        derivedSizeBytes: 500,
        width: 4000,
        height: 3000,
      },
    ]);
    // The open cover upload completes through the route it came from.
    expect(
      (await client.query(`SELECT "imageTarget"::text AS "target" FROM "UploadSession"`)).rows,
    ).toEqual([{ target: 'LEGACY_COVER' }]);
    // Expand step: the old table and column are kept as they were.
    expect((await client.query(`SELECT count(*)::int AS n FROM "CollectionCover"`)).rows).toEqual([
      { n: 3 },
    ]);
  });
});
