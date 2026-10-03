import { Injectable } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Per-collection frame numbers (ADR 0015) [C8]. Gaps are never filled: a deleted frame's number
 * is not reused.
 */
@Injectable()
export class FrameNumbers {
  /**
   * Takes the collection's next number inside the caller's transaction, which must then create
   * the item. The `UPDATE` row-locks the collection until commit, so concurrent creations queue
   * here and get consecutive numbers; a rolled-back transaction gives its number back. The same
   * statement re-checks that the collection is still `ACTIVE`.
   *
   * Lock order [C9]: a transaction that locks both takes the owner's `User` row first
   * (`UsageService.lockOwner`), then the `Collection` row here.
   */
  async next(tx: Prisma.TransactionClient, collectionId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ frameNo: number }[]>`
      UPDATE "Collection" SET "nextFrameNo" = "nextFrameNo" + 1
      WHERE "id" = ${collectionId}::uuid AND "status" = 'ACTIVE'
      RETURNING "nextFrameNo" - 1 AS "frameNo"`;
    const frameNo = rows[0]?.frameNo;
    if (frameNo !== undefined) return frameNo;
    const collection = await tx.collection.findUnique({
      where: { id: collectionId },
      select: { status: true },
    });
    if (collection?.status === 'ARCHIVED') throw new AppError('COLLECTION_ARCHIVED', 403);
    throw new AppError('COLLECTION_UNAVAILABLE', 410);
  }
}
