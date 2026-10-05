import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AccountPrincipal } from '../auth/principal.js';
import { mediaOf, WITH_MEDIA } from '../content/media-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { CollectionStatus, ImageSource, Prisma } from '../generated/prisma/client.js';
import { GuestPageRepository, type PageImageSlot } from '../guest-page/guest-page.repository.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { UsageService } from '../limits/usage.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { viaStorage } from '../uploads/uploads.service.js';
import { imageKey } from './image-keys.js';

/**
 * Where a new image goes (plan Task 7):
 * - the collection image (admin-only, `Collection.imageId`);
 * - a guest page slot of the draft (created if absent; guests see it only after publishing).
 */
export type ImageTarget = { slot: 'COLLECTION_IMAGE' } | { slot: PageImageSlot; version: 'DRAFT' };

/** What a new image row needs; the key of its original is `imageKey(cid, slot, id, 'original')`. */
export interface NewImage {
  id: string;
  source: ImageSource;
  mimeType: string;
  originalSizeBytes: bigint;
}

export interface LockedCollection {
  id: string;
  ownerId: string;
}

/**
 * The admin's images of a collection: guest page covers and backgrounds, and the collection
 * image. A row lives while something references it (a guest page version or the collection);
 * whatever drops the last reference deletes the row in the same transaction (usage drops at once)
 * and queues `collection-image.purge` for its objects (`collectGarbage`). Every change runs after
 * `lockMutable`, so one collection's images and versions change one transaction at a time. The
 * object copy of a new original happens before that transaction, so a row never exists without
 * its original. Logs carry ids only.
 */
@Injectable()
export class CollectionImagesService {
  private readonly logger = new Logger(CollectionImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly pages: GuestPageRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Makes a guest photo the target's image [A8]: the frame must be a live PHOTO of the admin's
   * own collection (else `404`) with an original the worker did not fail on (else
   * `422 COVER_SOURCE_INVALID`). Its original is copied server-side into the image's own prefix,
   * so deleting the frame later never touches the image; then, in lock order [C9] (owner →
   * collection), the image is set with the quota checked once replaced images no longer count.
   * A refusal after the copy deletes the copied object best-effort.
   */
  async setFromFrame(
    a: AccountPrincipal,
    collectionId: string,
    target: ImageTarget,
    contentItemId: string,
  ): Promise<void> {
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

    const imageId = await this.newId();
    const key = imageKey(item.collection.id, target.slot, imageId, 'original');
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
        // Deleted while the original was copied: no image from it. The share lock keeps a
        // concurrent delete waiting until this transaction ends.
        const live = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "ContentItem"
          WHERE "id" = ${item.id}::uuid AND "deletedAt" IS NULL
          FOR SHARE`;
        if (live.length === 0) throw new AppError('NOT_FOUND', 404);
        await this.set(
          tx,
          locked.id,
          target,
          {
            id: imageId,
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
  }

  /**
   * Points the draft's cover or background back at an image the collection still has (the
   * editor's undo, owner remark 113): a row of this collection and slot, which exists only while
   * a version references it (`collectGarbage`). Gone → `404`. Its bytes already count, so no quota
   * check; what it replaces is collected as usual.
   */
  async restore(
    a: AccountPrincipal,
    collectionId: string,
    target: ImageTarget,
    imageId: string,
  ): Promise<void> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockMutable(tx, a, collectionId);
      const image = await tx.collectionImage.findFirst({
        where: { id: imageId, collectionId: locked.id, slot: target.slot },
        select: { id: true },
      });
      if (image === null) throw new AppError('NOT_FOUND', 404);
      const replaced = await this.point(tx, locked.id, target, image.id);
      await this.collectGarbage(tx, locked.id, replaced);
      this.logger.log({
        msg: 'image restored',
        collectionId: locked.id,
        imageId: image.id,
        slot: target.slot,
        replacedImageIds: replaced,
      });
    });
  }

  /** Removes the target's image; an image nothing else references goes. No image: no-op. */
  async remove(a: AccountPrincipal, collectionId: string, target: ImageTarget): Promise<void> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockMutable(tx, a, collectionId);
      await this.unset(tx, locked.id, target);
    });
  }

  /**
   * Row-locks the admin's own collection for an image or guest page change. Not theirs or
   * `DELETING` → `404`; `ARCHIVED` → `409 COLLECTION_ARCHIVED` [A6]. Lock order [C9]: callers
   * that also lock the owner (`UsageService.lockOwner`) do so before this. The id comes back as
   * stored (lowercase), since storage keys are case-sensitive.
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
   * Sets the target's image: the references it replaces are cleared and the images nothing else
   * references are collected, `reserve` runs (the quota check, once their bytes no longer count;
   * an upload completion passes none, its reservation was made at initiation), the new row is
   * inserted `PENDING`, referenced, and its renditions queued. The caller holds the collection
   * row lock and has called `jobs.ready()` before the transaction.
   */
  async set(
    tx: Prisma.TransactionClient,
    collectionId: string,
    target: ImageTarget,
    image: NewImage,
    reserve?: () => Promise<void>,
  ): Promise<void> {
    const replaced = await this.point(tx, collectionId, target, null);
    await this.collectGarbage(tx, collectionId, replaced);
    if (reserve !== undefined) await reserve();
    await tx.collectionImage.create({
      data: {
        id: image.id,
        collectionId,
        slot: target.slot,
        source: image.source,
        mimeType: image.mimeType,
        originalSizeBytes: image.originalSizeBytes,
      },
    });
    await this.point(tx, collectionId, target, image.id);
    await this.jobs.enqueue(tx, 'media.collection-image', { collectionId, imageId: image.id });
    this.logger.log({
      msg: 'image set',
      collectionId,
      imageId: image.id,
      slot: target.slot,
      version: 'version' in target ? target.version : null,
      source: image.source,
      replacedImageIds: replaced,
    });
  }

  /** Clears the target's image reference(s) and collects what nothing references any more. */
  async unset(
    tx: Prisma.TransactionClient,
    collectionId: string,
    target: ImageTarget,
  ): Promise<void> {
    const replaced = await this.point(tx, collectionId, target, null);
    await this.collectGarbage(tx, collectionId, replaced);
    if (replaced.length > 0) {
      this.logger.log({
        msg: 'image removed',
        collectionId,
        slot: target.slot,
        version: 'version' in target ? target.version : null,
        removedImageIds: replaced,
      });
    }
  }

  /**
   * Deletes the candidate image rows that no guest page version and not the collection
   * references, and queues `collection-image.purge` for each. Candidates of another collection
   * are ignored. The caller holds the collection row lock, so no reference appears meanwhile.
   */
  async collectGarbage(
    tx: Prisma.TransactionClient,
    collectionId: string,
    candidateIds: readonly (string | null)[],
  ): Promise<void> {
    const candidates = [...new Set(candidateIds.filter((id): id is string => id !== null))];
    if (candidates.length === 0) return;
    const referenced = await this.pages.referencedImageIds(tx, collectionId);
    const rows = await tx.collectionImage.findMany({
      where: { collectionId, id: { in: candidates.filter((id) => !referenced.has(id)) } },
      select: { id: true, slot: true },
    });
    if (rows.length === 0) return;
    await tx.collectionImage.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    for (const row of rows) {
      await this.jobs.enqueue(tx, 'collection-image.purge', {
        collectionId,
        imageId: row.id,
        slot: row.slot,
      });
    }
  }

  /** Points the target at `imageId` (or nothing) and returns the ids it pointed at before. */
  private async point(
    tx: Prisma.TransactionClient,
    collectionId: string,
    target: ImageTarget,
    imageId: string | null,
  ): Promise<string[]> {
    const replaced: (string | null)[] = [];
    if (target.slot === 'COLLECTION_IMAGE') {
      const { imageId: previous } = await tx.collection.findUniqueOrThrow({
        where: { id: collectionId },
        select: { imageId: true },
      });
      if (previous !== imageId) {
        await tx.collection.update({ where: { id: collectionId }, data: { imageId } });
      }
      replaced.push(previous);
    } else {
      await this.pages.ensureDraft(tx, collectionId);
      replaced.push(await this.pages.setImageRef(tx, collectionId, 'DRAFT', target.slot, imageId));
    }
    return [...new Set(replaced.filter((id): id is string => id !== null && id !== imageId))];
  }

  /** A UUIDv7 from the database, like every other id (keys are built from it before the row). */
  async newId(): Promise<string> {
    const [{ id }] = await this.prisma.$queryRaw<[{ id: string }]>`SELECT uuidv7()::text AS "id"`;
    return id;
  }
}
