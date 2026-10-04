import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Collection } from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { mediaOf, WITH_MEDIA } from '../content/media-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { CollectionStatus, CoverSource, Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { UsageService } from '../limits/usage.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { viaStorage } from '../uploads/uploads.service.js';
import { CollectionsService } from './collections.service.js';
import { coverKey } from './cover-keys.js';

/** What a new cover row needs; the key of its original is `coverKey(collectionId, id, 'original')`. */
export interface NewCover {
  id: string;
  source: CoverSource;
  mimeType: string;
  originalSizeBytes: bigint;
}

interface LockedCollection {
  id: string;
  ownerId: string;
}

/**
 * The collection cover [A2]: one row per collection, replaced whole. Setting a cover from an
 * upload (`CoverUploadsService`) or a frame (`setFromFrame`) goes through `replace`, run inside
 * a transaction after `lockMutable`; the object copy happens before that transaction, so a row
 * never exists without its original (an object without a row is deleted best-effort by the
 * caller, and the collection purge removes anything left). Logs carry ids only.
 */
@Injectable()
export class CoversService {
  private readonly logger = new Logger(CoversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly collections: CollectionsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Makes a guest photo the cover [A8]: the frame must be a live PHOTO of the admin's own
   * collection (else `404`) with an original that the worker did not fail on (else
   * `422 COVER_SOURCE_INVALID`). Its original is copied server-side into the cover's own prefix,
   * so deleting the frame later never touches the cover; then, in lock order [C9] (owner →
   * collection), the old cover goes, the quota is checked without it and the new row is
   * inserted. A refusal after the copy deletes the copied object best-effort.
   */
  async setFromFrame(
    a: AccountPrincipal,
    collectionId: string,
    contentItemId: string,
  ): Promise<Collection> {
    await this.jobs.ready();
    const item = await this.prisma.contentItem.findFirst({
      where: {
        id: contentItemId,
        collectionId,
        deletedAt: null,
        collection: { ownerId: a.userId, status: { not: 'DELETING' } },
      },
      include: {
        ...WITH_MEDIA,
        collection: { select: { id: true, ownerId: true, status: true } },
      },
    });
    if (item === null) throw new AppError('NOT_FOUND', 404);
    // Before the copy, so an archived collection costs no storage call; re-checked under the lock.
    if (item.collection.status === 'ARCHIVED') throw new AppError('COLLECTION_ARCHIVED', 409);
    const original = mediaOf(item, 'ORIGINAL');
    if (item.kind !== 'PHOTO' || original === undefined || item.processingStatus === 'FAILED') {
      throw new AppError('COVER_SOURCE_INVALID', 422);
    }

    const coverId = await this.newId();
    const key = coverKey(item.collection.id, coverId, 'original');
    try {
      await viaStorage(() => this.storage.copyObject(original.storageKey, key, original.mimeType));
    } catch (error) {
      // The frame was purged since it was read: gone, like a deleted frame. Anything else is
      // storage trouble (503, retryable).
      const source = await this.storage.head(original.storageKey).catch(() => undefined);
      if (source === null) throw new AppError('NOT_FOUND', 404);
      throw error;
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.usage.lockOwner(tx, item.collection.ownerId);
        const locked = await this.lockMutable(tx, a, item.collection.id);
        // Deleted while the original was copied: no cover from it. The share lock keeps a
        // concurrent delete waiting until this transaction ends.
        const live = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "ContentItem"
          WHERE "id" = ${item.id}::uuid AND "deletedAt" IS NULL
          FOR SHARE`;
        if (live.length === 0) throw new AppError('NOT_FOUND', 404);
        await this.replace(
          tx,
          locked.id,
          {
            id: coverId,
            source: 'FRAME',
            mimeType: original.mimeType,
            originalSizeBytes: original.sizeBytes,
          },
          () =>
            this.usage.assertCanReserve(tx, {
              userId: locked.ownerId,
              collectionId: locked.id,
              bytes: original.sizeBytes,
            }),
        );
      });
    } catch (error) {
      // Nothing recorded: the copy has no row and goes.
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
    return this.collections.read(a, collectionId);
  }

  /** Removes the cover: the row goes at once (usage drops), its prefix is purged. No cover: no-op. */
  async remove(a: AccountPrincipal, collectionId: string): Promise<void> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockMutable(tx, a, collectionId);
      const existing = await tx.collectionCover.findUnique({ where: { collectionId: locked.id } });
      if (existing === null) return;
      await tx.collectionCover.delete({ where: { id: existing.id } });
      await this.jobs.enqueue(tx, 'cover.purge', { collectionId: locked.id, coverId: existing.id });
      this.logger.log({ msg: 'cover removed', collectionId: locked.id, coverId: existing.id });
    });
  }

  /**
   * Row-locks the admin's own collection for a cover change. Not theirs or `DELETING` → `404`;
   * `ARCHIVED` → `409 COLLECTION_ARCHIVED` [A6]. Lock order [C9]: callers that also lock the
   * owner (`UsageService.lockOwner`) do so before this. The id comes back as stored (lowercase),
   * since storage keys are case-sensitive.
   */
  async lockMutable(
    tx: Prisma.TransactionClient,
    a: AccountPrincipal,
    collectionId: string,
  ): Promise<LockedCollection> {
    const [row] = await tx.$queryRaw<{ id: string; ownerId: string; status: CollectionStatus }[]>`
      SELECT "id"::text AS "id", "ownerId"::text AS "ownerId", "status" FROM "Collection"
      WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${a.userId}::uuid
        AND "status" <> 'DELETING'
      FOR UPDATE`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    if (row.status === 'ARCHIVED') throw new AppError('COLLECTION_ARCHIVED', 409);
    return { id: row.id, ownerId: row.ownerId };
  }

  /**
   * Replaces the collection's cover: the existing row (if any) is deleted and its prefix queued
   * for `cover.purge`, `reserve` runs (the quota check, once the old bytes no longer count; an
   * upload completion passes none, its reservation was made at initiation), the new row is
   * inserted `PENDING` and its derivatives queued. The caller holds the collection row lock
   * (`lockMutable`) and has called `jobs.ready()` before the transaction.
   */
  async replace(
    tx: Prisma.TransactionClient,
    collectionId: string,
    cover: NewCover,
    reserve?: () => Promise<void>,
  ): Promise<void> {
    const existing = await tx.collectionCover.findUnique({ where: { collectionId } });
    if (existing !== null) {
      await tx.collectionCover.delete({ where: { id: existing.id } });
      await this.jobs.enqueue(tx, 'cover.purge', { collectionId, coverId: existing.id });
    }
    if (reserve !== undefined) await reserve();
    await tx.collectionCover.create({
      data: {
        id: cover.id,
        collectionId,
        source: cover.source,
        mimeType: cover.mimeType,
        originalSizeBytes: cover.originalSizeBytes,
      },
    });
    await this.jobs.enqueue(tx, 'media.cover-derivatives', { collectionId, coverId: cover.id });
    this.logger.log({
      msg: 'cover set',
      collectionId,
      coverId: cover.id,
      source: cover.source,
      replacedCoverId: existing?.id ?? null,
    });
  }

  /** A UUIDv7 from the database, like every other id (the key is built from it before the row). */
  private async newId(): Promise<string> {
    const [{ id }] = await this.prisma.$queryRaw<[{ id: string }]>`SELECT uuidv7()::text AS "id"`;
    return id;
  }
}
