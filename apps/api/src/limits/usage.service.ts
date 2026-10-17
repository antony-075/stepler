import { Injectable } from '@nestjs/common';
import type { UsageResponse } from '@stepler/contracts';
import { toAccessDto } from '../billing/access-dto.js';
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

  /**
   * Only `ACTIVE` counts toward the limit; archiving frees a slot (D1). A pack collection counts
   * against its pack, not the account (ADR 0018 [P1]).
   */
  activeCollections(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<number> {
    return tx.collection.count({
      where: { ownerId: userId, status: 'ACTIVE', entitlement: 'ACCOUNT' },
    });
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
   * A frame the operator quarantined (slice 9b) stops counting too: the owner cannot use it,
   * though its files stay in storage until the purge (the operator console shows them).
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
          WHERE c."collectionId" = ${collectionId}::uuid AND c."deletedAt" IS NULL AND c."quarantinedAt" IS NULL
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

  /**
   * `collectionStorageBytes` for many collections in one query (a dashboard page; no N+1), by
   * the same definition, so a card's size and the account's storage line always agree. Ids
   * that are not found are left out of the map.
   */
  async storageBytesByCollection(
    collectionIds: readonly string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, bigint>> {
    if (collectionIds.length === 0) return new Map();
    const rows = await tx.$queryRaw<{ id: string; bytes: bigint }[]>`
      SELECT
        k."id"::text AS "id",
        COALESCE((
          SELECT SUM(m."sizeBytes") FROM "MediaObject" m
          JOIN "ContentItem" c ON c."id" = m."contentItemId"
          WHERE c."collectionId" = k."id" AND c."deletedAt" IS NULL AND c."quarantinedAt" IS NULL
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(v."originalSizeBytes" + v."derivedSizeBytes") FROM "CollectionImage" v
          WHERE v."collectionId" = k."id"
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(u."declaredSizeBytes") FROM "UploadSession" u
          WHERE u."collectionId" = k."id" AND u."status" IN ('INITIATED', 'COMPLETING')
        ), 0)::bigint AS "bytes"
      FROM "Collection" k
      WHERE k."id" = ANY(${[...collectionIds]}::uuid[])`;
    return new Map(rows.map((row) => [row.id, row.bytes]));
  }

  /**
   * The same over every `ACCOUNT` collection of the account that is not being deleted; pack
   * collections have their own storage (ADR 0018 [P1]).
   */
  async accountStorageBytes(tx: Prisma.TransactionClient, userId: string): Promise<bigint> {
    const [row] = await tx.$queryRaw<[{ bytes: bigint }]>`
      SELECT
        COALESCE((
          SELECT SUM(m."sizeBytes") FROM "MediaObject" m
          JOIN "ContentItem" c ON c."id" = m."contentItemId"
          JOIN "Collection" k ON k."id" = c."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING' AND k."entitlement" = 'ACCOUNT'
            AND c."deletedAt" IS NULL AND c."quarantinedAt" IS NULL
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(v."originalSizeBytes" + v."derivedSizeBytes") FROM "CollectionImage" v
          JOIN "Collection" k ON k."id" = v."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING' AND k."entitlement" = 'ACCOUNT'
        ), 0)::bigint
        + COALESCE((
          SELECT SUM(u."declaredSizeBytes") FROM "UploadSession" u
          JOIN "Collection" k ON k."id" = u."collectionId"
          WHERE k."ownerId" = ${userId}::uuid AND k."status" <> 'DELETING' AND k."entitlement" = 'ACCOUNT'
            AND u."status" IN ('INITIATED', 'COMPLETING')
        ), 0)::bigint AS "bytes"`;
    return row.bytes;
  }

  /**
   * Refuses a reservation of `bytes` that would take the collection, or for an `ACCOUNT`
   * collection the account, over its limit: one code for both, so a guest learns nothing about
   * the owner's other collections. Call it after `lockOwner` in the transaction that inserts the
   * reservation, so concurrent reservations are checked one after another.
   */
  async assertCanReserve(
    tx: Prisma.TransactionClient,
    request: { userId: string; collectionId: string; bytes: bigint },
  ): Promise<void> {
    const limits = await this.limits.forCollection(request.collectionId, tx);
    const collectionBytes = await this.collectionStorageBytes(tx, request.collectionId);
    if (collectionBytes + request.bytes > limits.storageBytes) {
      throw new AppError('QUOTA_EXCEEDED', 409);
    }
    if (limits.entitlement === 'PACK') return;
    // An account collection's access is the account's, limits included.
    const accountLimit = limits.access.limits.storageBytes ?? 0n;
    const accountBytes = await this.accountStorageBytes(tx, request.userId);
    if (accountBytes + request.bytes > accountLimit) throw new AppError('QUOTA_EXCEEDED', 409);
  }

  async forUser(userId: string): Promise<UsageResponse> {
    const limits = await this.limits.forUser(userId);
    return {
      activeCollections: {
        used: await this.activeCollections(userId),
        limit: limits.activeCollections,
      },
      storage: {
        usedBytes: Number(await this.accountStorageBytes(this.prisma, userId)),
        limitBytes: Number(limits.storageBytes),
      },
      access: toAccessDto(limits.access),
    };
  }

  /** A collection's storage line («Використано 3,4 ГБ з 10 ГБ»). */
  async forCollection(collectionId: string, tx: Prisma.TransactionClient = this.prisma) {
    return {
      usedBytes: Number(await this.collectionStorageBytes(tx, collectionId)),
      limitBytes: Number((await this.limits.forCollection(collectionId, tx)).storageBytes),
    };
  }
}
