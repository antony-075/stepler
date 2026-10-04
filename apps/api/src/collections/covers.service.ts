import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AccountPrincipal } from '../auth/principal.js';
import { AppError } from '../errors/app-error.js';
import type { CollectionStatus, CoverSource, Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';

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
 * upload or a frame goes through `replace`, which the callers run inside their own transaction
 * after `lockMutable`; the object copy happens before that transaction, so a row never exists
 * without its original (an object without a row is deleted best-effort by the caller, and the
 * collection purge removes anything left).
 */
@Injectable()
export class CoversService {
  private readonly logger = new Logger(CoversService.name);

  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

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
}
