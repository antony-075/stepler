import { Inject, Injectable } from '@nestjs/common';
import type {
  CollectionDetail,
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
import { collectionPurgeDelaySeconds } from '../jobs/job-names.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';
import { UsageService } from '../limits/usage.service.js';
import { GuestPageRepository } from '../guest-page/guest-page.repository.js';
import { ImageUrls } from '../images/image-urls.js';
import {
  type CollectionWithDefaultLink,
  type ContentStats,
  imagesOf,
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
    private readonly images: ImageUrls,
    private readonly pages: GuestPageRepository,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
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
      // And its guest page: the default template with its defaults, published (ADR 0017).
      await this.pages.ensurePublished(tx, row.id);
      return toCollectionDto({
        ...row,
        guestLinks: [link],
        guestPageVersions: [{ welcomeMessage: null, coverImage: null }],
        image: null,
      });
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
    const content = await this.contentStats(items.map((row) => row.id));
    // One signing moment for the page, so every URL falls in the same window.
    const now = new Date();
    return {
      items: await Promise.all(
        items.map(async (row) =>
          toCollectionDto(row, content.get(row.id), await this.signImages(row, now)),
        ),
      ),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  /** The detail view: the collection and its storage use (lists leave the sums out). */
  async get(principal: AccountPrincipal, id: string): Promise<CollectionDetail> {
    const dto = await this.toDto(await this.findOwned(id, principal.userId));
    return { ...dto, storage: await this.usage.forCollection(id) };
  }

  /** The collection without its storage line: the shape lists and mutations answer with. */
  async read(principal: AccountPrincipal, id: string): Promise<Collection> {
    return this.toDto(await this.findOwned(id, principal.userId));
  }

  /**
   * Last write wins. Archived collections stay editable (D9), the welcome message too [A6]. The
   * welcome is the guest page's now (plan Task 7, legacy adapter until PR J): it is written to the
   * published version, and to the draft while one exists, so guests see it at once as before.
   */
  async update(
    principal: AccountPrincipal,
    id: string,
    body: UpdateCollectionRequest,
  ): Promise<Collection> {
    return this.prisma.$transaction(async (tx) => {
      let row: CollectionWithDefaultLink;
      try {
        row = await tx.collection.update({
          where: { id, ownerId: principal.userId, status: { not: 'DELETING' } },
          data: {
            ...(body.title === undefined ? {} : { title: body.title }),
            ...(body.description === undefined ? {} : { description: body.description }),
          },
          include: WITH_DEFAULT_LINK,
        });
      } catch (error) {
        if (isRecordNotFound(error)) throw new AppError('NOT_FOUND', 404);
        throw error;
      }
      if (body.welcomeMessage === undefined) return this.toDto(row, tx);
      await this.pages.ensurePublished(tx, row.id);
      await tx.guestPageVersion.updateMany({
        where: { collectionId: row.id },
        data: { welcomeMessage: body.welcomeMessage },
      });
      // Changed outside the editor: a tab saving from the draft's revision before gets a 409.
      await this.pages.bumpDraft(tx, row.id);
      return this.toDto(await this.findOwned(row.id, principal.userId, tx), tx);
    });
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
      return this.toDto(await this.findOwned(id, principal.userId, tx), tx);
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
      if (row.status !== 'ARCHIVED') return this.toDto(row, tx);
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
      return this.toDto(await this.findOwned(id, userId, tx), tx);
    });
  }

  /**
   * Requests deletion (D2): the collection becomes `DELETING`, which is gone for everyone; the
   * `collection.purge` job, enqueued in the same transaction, removes the objects and rows once
   * every upload URL issued before the deletion has expired (`collectionPurgeDelaySeconds`).
   * Repeating it for an owned collection is a no-op.
   */
  async delete(principal: AccountPrincipal, id: string, requestId?: string): Promise<void> {
    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      // Includes DELETING (for the no-op) and locks the row, so `fromStatus` is accurate. The id
      // is read back: PostgreSQL matches a UUID in any case, storage keys are case-sensitive.
      const [row] = await tx.$queryRaw<{ id: string; status: CollectionRow['status'] }[]>`
        SELECT "id"::text AS "id", "status" FROM "Collection"
        WHERE "id" = ${id}::uuid AND "ownerId" = ${principal.userId}::uuid
        FOR UPDATE`;
      if (row === undefined) throw new AppError('NOT_FOUND', 404);
      if (row.status === 'DELETING') return;
      await tx.collection.update({
        where: { id: row.id },
        data: { status: 'DELETING', deletionRequestedAt: new Date(), archivedAt: null },
      });
      await this.recordTransition(
        tx,
        principal,
        row.id,
        'collection.delete',
        row.status,
        'DELETING',
        requestId,
      );
      await this.jobs.enqueue(
        tx,
        'collection.purge',
        { collectionId: row.id, ...(requestId === undefined ? {} : { requestId }) },
        {
          startAfterSeconds: collectionPurgeDelaySeconds(this.limits.uploads().urlTtlSeconds),
        },
      );
    });
  }

  private async toDto(
    row: CollectionWithDefaultLink,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Collection> {
    const content = await this.contentStats([row.id], tx);
    return toCollectionDto(row, content.get(row.id), await this.signImages(row));
  }

  /** The cover and the collection image, signed in one window. */
  private async signImages(row: CollectionWithDefaultLink, now = new Date()) {
    const { cover, image } = imagesOf(row);
    const [coverDto, imageDto] = await Promise.all([
      this.images.forAdmin(cover, now),
      this.images.forAdmin(image, now),
    ]);
    return { cover: coverDto, image: imageDto };
  }

  /** One grouped query for a whole page, never one per collection (no N+1). */
  private async contentStats(
    collectionIds: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, ContentStats>> {
    if (collectionIds.length === 0) return new Map();
    const groups = await tx.contentItem.groupBy({
      by: ['collectionId'],
      where: { collectionId: { in: collectionIds }, deletedAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    return new Map(
      groups.map((group) => [
        group.collectionId,
        { count: group._count._all, lastAt: group._max.createdAt },
      ]),
    );
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
