import { Injectable } from '@nestjs/common';
import type { UsageResponse } from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LimitsService } from './limits.service.js';

/** What an account currently uses, measured against `LimitsService` (ADR 0010). */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /**
   * Serializes limit checks per account: concurrent transactions that change the account's
   * usage wait here until the first commits, so a check-then-insert cannot overshoot (§10.3).
   *
   * Lock order [C9]: a transaction that locks both takes the owner's `User` row here first, then
   * the `Collection` row (`FrameNumbers.next`), never the other way round, so two such
   * transactions cannot deadlock.
   */
  async lockOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  }

  /** Only `ACTIVE` counts toward the limit; archiving frees a slot (D1). */
  activeCollections(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<number> {
    return tx.collection.count({ where: { ownerId: userId, status: 'ACTIVE' } });
  }

  /** Counted from audit events, so deleted collections still count. */
  async collectionCreationsSince(
    userId: string,
    since: Date,
    tx: Prisma.TransactionClient,
  ): Promise<{ count: number; oldest: Date | null }> {
    const where = { actorId: userId, action: 'collection.create', createdAt: { gt: since } };
    const result = await tx.auditEvent.aggregate({
      where,
      _count: { _all: true },
      _min: { createdAt: true },
    });
    return { count: result._count._all, oldest: result._min.createdAt };
  }

  /**
   * Bytes a collection holds (spec §13.2, ADR 0010): every stored file (originals and
   * derivatives) of its non-deleted items, its admin images of every slot (original and
   * renditions; plan Task 7), plus the declared size of its open (`INITIATED` or `COMPLETING`)
   * uploads, which reserve their space until they complete, fail or expire. A deleted item or an
   * image nothing references any more stops counting at once, before the worker purges its objects.
   */
  async collectionStorageBytes(
    tx: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<bigint> {
    const [row] = await tx.$queryRaw<[{ bytes: bigint }]>`
      SELECT
        COALESCE((
          SELECT SUM(m."sizeBytes") FROM "MediaObject" m
          JOIN "ContentItem" c ON c."id" = m."contentItemId"
          WHERE c."collectionId" = ${collectionId}::uuid AND c."deletedAt" IS NULL
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(v."originalSizeBytes" + v."derivedSizeBytes") FROM "CollectionImage" v
          WHERE v."collectionId" = ${collectionId}::uuid
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(u."declaredSizeBytes") FROM "UploadSession" u
          WHERE u."collectionId" = ${collectionId}::uuid
            AND u."status" IN ('INITIATED', 'COMPLETING')
        ), 0)::bigint AS "bytes"`;
    return row.bytes;
  }

  /** The same over every collection of the account that is not being deleted. */
  async accountStorageBytes(tx: Prisma.TransactionClient, userId: string): Promise<bigint> {
    const [row] = await tx.$queryRaw<[{ bytes: bigint }]>`
      SELECT
        COALESCE((
          SELECT SUM(m."sizeBytes") FROM "MediaObject" m
          JOIN "ContentItem" c ON c."id" = m."contentItemId"
          JOIN "Collection" k ON k."id" = c."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING'
            AND c."deletedAt" IS NULL
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(v."originalSizeBytes" + v."derivedSizeBytes") FROM "CollectionImage" v
          JOIN "Collection" k ON k."id" = v."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING'
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(u."declaredSizeBytes") FROM "UploadSession" u
          JOIN "Collection" k ON k."id" = u."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING'
            AND u."status" IN ('INITIATED', 'COMPLETING')
        ), 0)::bigint AS "bytes"`;
    return row.bytes;
  }

  /**
   * Refuses a reservation of `bytes` that would take the collection or the account over its
   * limit: one code for both, so a guest learns nothing about the owner's other collections.
   * Call it after `lockOwner` in the transaction that inserts the reservation, so concurrent
   * reservations are checked one after another.
   */
  async assertCanReserve(
    tx: Prisma.TransactionClient,
    request: { userId: string; collectionId: string; bytes: bigint },
  ): Promise<void> {
    const collectionLimit = this.limits.forCollection({ id: request.collectionId }).storageBytes;
    const accountLimit = this.limits.forUser({ id: request.userId }).storageBytes;
    const [collectionBytes, accountBytes] = [
      await this.collectionStorageBytes(tx, request.collectionId),
      await this.accountStorageBytes(tx, request.userId),
    ];
    if (
      collectionBytes + request.bytes > collectionLimit ||
      accountBytes + request.bytes > accountLimit
    ) {
      throw new AppError('QUOTA_EXCEEDED', 409);
    }
  }

  async forUser(userId: string): Promise<UsageResponse> {
    const limits = this.limits.forUser({ id: userId });
    return {
      activeCollections: {
        used: await this.activeCollections(userId),
        limit: limits.activeCollections,
      },
      storage: {
        usedBytes: Number(await this.accountStorageBytes(this.prisma, userId)),
        limitBytes: Number(limits.storageBytes),
      },
    };
  }

  /** A collection's storage line («Використано 3,4 ГБ з 10 ГБ»). */
  async forCollection(collectionId: string, tx: Prisma.TransactionClient = this.prisma) {
    return {
      usedBytes: Number(await this.collectionStorageBytes(tx, collectionId)),
      limitBytes: Number(this.limits.forCollection({ id: collectionId }).storageBytes),
    };
  }
}
