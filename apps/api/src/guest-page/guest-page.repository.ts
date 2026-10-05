import { Injectable } from '@nestjs/common';
import { DEFAULT_TEMPLATE_ID, definitionOf } from '@stepler/templates/core';
import type {
  GuestPageVersion,
  GuestPageVersionState,
  Prisma,
} from '../generated/prisma/client.js';

/** The guest page slots a version references (the collection image is the collection's). */
export type PageImageSlot = 'COVER' | 'BACKGROUND';

const COLUMN: Record<PageImageSlot, 'coverImageId' | 'backgroundImageId'> = {
  COVER: 'coverImageId',
  BACKGROUND: 'backgroundImageId',
};

/**
 * Reads and writes of a collection's guest page versions (plan Task 7, ADR 0017), inside the
 * caller's transaction. Callers hold the collection row lock (`lockMutable`) for every write, so
 * versions of one collection never change concurrently. No other dependency than Prisma.
 */
@Injectable()
export class GuestPageRepository {
  /** The published version (created with the default template if a collection has none yet) and the draft. */
  async readVersions(
    tx: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<{ published: GuestPageVersion; draft: GuestPageVersion | null }> {
    const rows = await tx.guestPageVersion.findMany({ where: { collectionId } });
    const published =
      rows.find((row) => row.state === 'PUBLISHED') ??
      (await this.ensurePublished(tx, collectionId));
    return { published, draft: rows.find((row) => row.state === 'DRAFT') ?? null };
  }

  /**
   * The published version, inserted with the default template's defaults when missing (every
   * collection gets one at creation, and the migration backfilled the rest; this is the backstop).
   */
  async ensurePublished(
    tx: Prisma.TransactionClient,
    collectionId: string,
    welcomeMessage: string | null = null,
  ): Promise<GuestPageVersion> {
    const def = definitionOf(DEFAULT_TEMPLATE_ID);
    if (def === undefined) throw new Error('The default template is not registered');
    return tx.guestPageVersion.upsert({
      where: { collectionId_state: { collectionId, state: 'PUBLISHED' } },
      create: {
        collectionId,
        state: 'PUBLISHED',
        templateId: def.id,
        templateVersion: def.version,
        settings: def.defaults,
        welcomeMessage,
      },
      update: {},
    });
  }

  /**
   * The next guest page revision of the collection (`Collection.lastPageRevision + 1`, taken).
   * Revisions never repeat within a collection, so one names one draft state: a draft created
   * after a publish or a reset never reuses the number an old tab still holds.
   */
  async nextRevision(tx: Prisma.TransactionClient, collectionId: string): Promise<number> {
    const [row] = await tx.$queryRaw<{ revision: number }[]>`
      UPDATE "Collection" SET "lastPageRevision" = "lastPageRevision" + 1
      WHERE "id" = ${collectionId}::uuid
      RETURNING "lastPageRevision" AS "revision"`;
    if (row === undefined) throw new Error('The collection is gone');
    return row.revision;
  }

  /**
   * The draft, or a new one copied from the published version with the next revision and no
   * `savedAt` (untouched: a first save with `baseRevision: null` may still take it).
   */
  async ensureDraft(tx: Prisma.TransactionClient, collectionId: string): Promise<GuestPageVersion> {
    const { published, draft } = await this.readVersions(tx, collectionId);
    if (draft !== null) return draft;
    const revision = await this.nextRevision(tx, collectionId);
    return tx.guestPageVersion.create({
      data: {
        collectionId,
        state: 'DRAFT',
        templateId: published.templateId,
        templateVersion: published.templateVersion,
        settings: published.settings as Prisma.InputJsonValue,
        welcomeMessage: published.welcomeMessage,
        coverImageId: published.coverImageId,
        backgroundImageId: published.backgroundImageId,
        revision,
      },
    });
  }

  /** The draft row, locked for this transaction (`FOR UPDATE`), or `null`. */
  async lockDraft(
    tx: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<GuestPageVersion | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "GuestPageVersion"
      WHERE "collectionId" = ${collectionId}::uuid AND "state" = 'DRAFT'
      FOR UPDATE`;
    const [row] = locked;
    return row === undefined
      ? null
      : tx.guestPageVersion.findUniqueOrThrow({ where: { id: row.id } });
  }

  /**
   * Points the version in `state` at `imageId` for `slot` (or clears it with `null`) and returns
   * the id it replaced. A version that does not exist is left alone (`null`). Never bumps the
   * draft's revision: image changes do not conflict with the editor's autosave.
   */
  async setImageRef(
    tx: Prisma.TransactionClient,
    collectionId: string,
    state: GuestPageVersionState,
    slot: PageImageSlot,
    imageId: string | null,
  ): Promise<string | null> {
    const row = await tx.guestPageVersion.findUnique({
      where: { collectionId_state: { collectionId, state } },
      select: { id: true, coverImageId: true, backgroundImageId: true },
    });
    if (row === null) return null;
    const column = COLUMN[slot];
    const replaced = row[column];
    if (replaced !== imageId) {
      await tx.guestPageVersion.update({ where: { id: row.id }, data: { [column]: imageId } });
    }
    return replaced;
  }

  /** Every image id a version of the collection, or the collection itself, references. */
  async referencedImageIds(
    tx: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<Set<string>> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "coverImageId"::text AS "id" FROM "GuestPageVersion"
        WHERE "collectionId" = ${collectionId}::uuid AND "coverImageId" IS NOT NULL
      UNION
      SELECT "backgroundImageId"::text FROM "GuestPageVersion"
        WHERE "collectionId" = ${collectionId}::uuid AND "backgroundImageId" IS NOT NULL
      UNION
      SELECT "imageId"::text FROM "Collection"
        WHERE "id" = ${collectionId}::uuid AND "imageId" IS NOT NULL`;
    return new Set(rows.map((row) => row.id));
  }
}
