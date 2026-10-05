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
  test('backfills one published classic page per collection, with the welcome and the cover', async () => {
    expect(index).toBeGreaterThan(0);
    const [{ id: ownerId }] = (
      await client.query<{ id: string }>(
        `INSERT INTO "User" ("email", "updatedAt") VALUES ('olena@example.com', now()) RETURNING "id"::text`,
      )
    ).rows as [{ id: string }];
    const insertCollection = async (title: string, welcome: string | null) =>
      (
        (
          await client.query<{ id: string }>(
            `INSERT INTO "Collection" ("ownerId", "title", "welcomeMessage", "updatedAt")
             VALUES ($1, $2, $3, now()) RETURNING "id"::text`,
            [ownerId, title, welcome],
          )
        ).rows[0] as { id: string }
      ).id;
    const dressed = await insertCollection('Весілля', 'Дякуємо, що ви з нами!');
    const bare = await insertCollection('Ювілей', null);
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
    expect(versions.rows).toHaveLength(2);
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
         FROM "CollectionImage"`,
    );
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
    // Expand step: the old table and column are kept as they were.
    expect((await client.query(`SELECT count(*)::int AS n FROM "CollectionCover"`)).rows).toEqual([
      { n: 1 },
    ]);
  });
});
