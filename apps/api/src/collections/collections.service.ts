import { Injectable } from '@nestjs/common';
import type {
  Collection,
  CollectionListResponse,
  CreateCollectionRequest,
  ListCollectionsQuery,
  UpdateCollectionRequest,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { Principal } from '../auth/principal.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { Prisma, type Collection as CollectionRow } from '../generated/prisma/client.js';
import { LimitsService } from '../limits/limits.service.js';
import { UsageService } from '../limits/usage.service.js';
import { toCollectionDto } from './collection-dto.js';

const DAY_MS = 24 * 3600_000;

/** Owner-scoped: every query filters by the principal's user id, and DELETING is invisible. */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
  ) {}

  /** Daily cap first, then the active limit, both under the owner's row lock (spec §10.3). */
  async create(
    principal: Principal,
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
      return toCollectionDto(row);
    });
  }

  /** Newest first, keyset over `(createdAt, id)` (ADR 0004). */
  async list(principal: Principal, query: ListCollectionsQuery): Promise<CollectionListResponse> {
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
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toCollectionDto),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async get(principal: Principal, id: string): Promise<Collection> {
    return toCollectionDto(await this.findOwned(id, principal.userId));
  }

  /** Last write wins. Archived collections stay editable (D9). */
  async update(
    principal: Principal,
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
      });
      return toCollectionDto(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new AppError('NOT_FOUND', 404);
      throw error;
    }
  }

  private async findOwned(
    id: string,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<CollectionRow> {
    const row = await tx.collection.findFirst({
      where: { id, ownerId: userId, status: { not: 'DELETING' } },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
