import { Injectable } from '@nestjs/common';
import type {
  Collection,
  CollectionListResponse,
  CreateCollectionRequest,
  ListCollectionsQuery,
  UpdateCollectionRequest,
} from '@stepler/contracts';
import { type AuditAction, AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { Prisma, type Collection as CollectionRow } from '../generated/prisma/client.js';
import { GuestLinksService } from '../guest-access/guest-links.service.js';
import { LimitsService } from '../limits/limits.service.js';
import { UsageService } from '../limits/usage.service.js';
import {
  type CollectionWithDefaultLink,
  toCollectionDto,
  WITH_DEFAULT_LINK,
} from './collection-dto.js';

const DAY_MS = 24 * 3600_000;

/** Owner-scoped: every query filters by the principal's user id, and DELETING is invisible. */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
    private readonly guestLinks: GuestLinksService,
  ) {}

  /** Daily cap first, then the active limit, both under the owner's row lock (spec §10.3). */
  async create(
    principal: AccountPrincipal,
    body: CreateCollectionRequest,
    requestId?: string,
  ): Promise<Collection> {
    const { userId } = principal;
    const limits = this.limits.forUser({ id: userId });
    return this.prisma.$transaction(async (tx) => {
      await this.usage.lockOwner(tx, userId);

      const now = Date.now();
      const creations = await this.usage.collectionCreationsSince(
        userId,
        new Date(now - DAY_MS),
        tx,
      );
      if (creations.count >= limits.collectionCreationsPerDay) {
        const oldest = creations.oldest?.getTime() ?? now;
        throw new AppError('RATE_LIMITED', 429, {
          retryable: true,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - now) / 1000)),
        });
      }
      if ((await this.usage.activeCollections(userId, tx)) >= limits.activeCollections) {
        throw new AppError('COLLECTION_LIMIT_REACHED', 409);
      }

      const row = await tx.collection.create({
        data: { ownerId: userId, title: body.title, description: body.description ?? null },
      });
      await this.audit.record(tx, {
        collectionId: row.id,
        actor: principal,
        action: 'collection.create',
        targetType: 'collection',
        targetId: row.id,
        metadata: { toStatus: 'ACTIVE' },
        ...(requestId === undefined ? {} : { requestId }),
      });
      // Every collection is created with its default guest link (PRODUCT §5.3), atomically.
      const link = await this.guestLinks.createDefault(tx, row.id, principal, requestId);
      return toCollectionDto({ ...row, guestLinks: [link] });
    });
  }

  /** Newest first, keyset over `(createdAt, id)` (ADR 0004). */
  async list(
    principal: AccountPrincipal,
    query: ListCollectionsQuery,
  ): Promise<CollectionListResponse> {
    const position = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (position === null) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
      });
    }
    const rows = await this.prisma.collection.findMany({
      where: {
        ownerId: principal.userId,
        status: query.status,
        ...(position === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: position.createdAt } },
                { createdAt: position.createdAt, id: { lt: position.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: WITH_DEFAULT_LINK,
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toCollectionDto),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async get(principal: AccountPrincipal, id: string): Promise<Collection> {
    return toCollectionDto(await this.findOwned(id, principal.userId));
  }

  /** Last write wins. Archived collections stay editable (D9). */
  async update(
    principal: AccountPrincipal,
    id: string,
    body: UpdateCollectionRequest,
  ): Promise<Collection> {
    try {
      const row = await this.prisma.collection.update({
        where: { id, ownerId: principal.userId, status: { not: 'DELETING' } },
        data: {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.description === undefined ? {} : { description: body.description }),
        },
        include: WITH_DEFAULT_LINK,
      });
      return toCollectionDto(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new AppError('NOT_FOUND', 404);
      throw error;
    }
  }

  /** `ACTIVE` → `ARCHIVED`; guests lose access. Idempotent: an archived one is returned as is. */
  async archive(principal: AccountPrincipal, id: string, requestId?: string): Promise<Collection> {
    return this.prisma.$transaction(async (tx) => {
      // Conditional, so concurrent archives change (and audit) the row once.
      const { count } = await tx.collection.updateMany({
        where: { id, ownerId: principal.userId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      if (count === 1) {
        await this.recordTransition(
          tx,
          principal,
          id,
          'collection.archive',
          'ACTIVE',
          'ARCHIVED',
          requestId,
        );
      }
      return toCollectionDto(await this.findOwned(id, principal.userId, tx));
    });
  }

  /** `ARCHIVED` → `ACTIVE` under the owner lock, refused at the active limit (D1). Idempotent. */
  async unarchive(
    principal: AccountPrincipal,
    id: string,
    requestId?: string,
  ): Promise<Collection> {
    const { userId } = principal;
    const limits = this.limits.forUser({ id: userId });
    return this.prisma.$transaction(async (tx) => {
      await this.usage.lockOwner(tx, userId);
      const row = await this.findOwned(id, userId, tx);
      if (row.status !== 'ARCHIVED') return toCollectionDto(row);
      if ((await this.usage.activeCollections(userId, tx)) >= limits.activeCollections) {
        throw new AppError('COLLECTION_LIMIT_REACHED', 409);
      }
      const { count } = await tx.collection.updateMany({
        where: { id, ownerId: userId, status: 'ARCHIVED' },
        data: { status: 'ACTIVE', archivedAt: null },
      });
      if (count === 1) {
        await this.recordTransition(
          tx,
          principal,
          id,
          'collection.unarchive',
          'ARCHIVED',
          'ACTIVE',
          requestId,
        );
      }
      return toCollectionDto(await this.findOwned(id, userId, tx));
    });
  }

  /**
   * Requests deletion (D2): the collection becomes `DELETING`, which is gone for everyone; the
   * purge job removes the rows and objects later. Repeating it for an owned collection is a no-op.
   */
  async delete(principal: AccountPrincipal, id: string, requestId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Includes DELETING (for the no-op) and locks the row, so `fromStatus` is accurate.
      const [row] = await tx.$queryRaw<{ status: CollectionRow['status'] }[]>`
        SELECT "status" FROM "Collection"
        WHERE "id" = ${id}::uuid AND "ownerId" = ${principal.userId}::uuid
        FOR UPDATE`;
      if (row === undefined) throw new AppError('NOT_FOUND', 404);
      if (row.status === 'DELETING') return;
      await tx.collection.update({
        where: { id },
        data: { status: 'DELETING', deletionRequestedAt: new Date(), archivedAt: null },
      });
      await this.recordTransition(
        tx,
        principal,
        id,
        'collection.delete',
        row.status,
        'DELETING',
        requestId,
      );
    });
  }

  private recordTransition(
    tx: Prisma.TransactionClient,
    actor: AccountPrincipal,
    id: string,
    action: AuditAction,
    fromStatus: CollectionRow['status'],
    toStatus: CollectionRow['status'],
    requestId: string | undefined,
  ): Promise<void> {
    return this.audit.record(tx, {
      collectionId: id,
      actor,
      action,
      targetType: 'collection',
      targetId: id,
      metadata: { fromStatus, toStatus },
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  private async findOwned(
    id: string,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CollectionWithDefaultLink> {
    const row = await tx.collection.findFirst({
      where: { id, ownerId: userId, status: { not: 'DELETING' } },
      include: WITH_DEFAULT_LINK,
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
