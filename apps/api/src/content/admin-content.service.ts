import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminContentDetail,
  AdminContentListQuery,
  AdminContentPage,
  BulkDeleteContentResponse,
  ContentCounts,
} from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { ContentDeletion } from './content-deletion.js';
import { toAdminContentDetail, toAdminContentItem } from './content-dto.js';
import { ContentQueries } from './content-queries.js';
import { MediaUrls, WITH_MEDIA } from './media-urls.js';

/**
 * The collection owner's view of content. Rows are reached only through
 * `collection.ownerId = principal.userId` and a collection that is not `DELETING`; anything
 * else is `404` (no existence disclosure). Operators have no content access in this work.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ContentQueries,
    private readonly deletion: ContentDeletion,
    private readonly media: MediaUrls,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async list(
    a: AccountPrincipal,
    collectionId: string,
    query: AdminContentListQuery,
  ): Promise<AdminContentPage> {
    await this.assertOwnedCollection(a, collectionId);
    const { rows, nextCursor } = await this.queries.page(
      { collectionId, ...(query.kind === undefined ? {} : { kind: query.kind }) },
      query.cursor,
      query.limit,
      query.sort,
    );
    const items = await Promise.all(
      rows.map(async (row) => toAdminContentItem(row, await this.media.forItem(row))),
    );
    return { items, nextCursor };
  }

  async counts(a: AccountPrincipal, collectionId: string): Promise<ContentCounts> {
    await this.assertOwnedCollection(a, collectionId);
    return this.queries.counts(collectionId);
  }

  async get(a: AccountPrincipal, id: string): Promise<AdminContentDetail> {
    const row = await this.prisma.contentItem.findFirst({
      where: { id, deletedAt: null, collection: ownedBy(a) },
      include: WITH_MEDIA,
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return toAdminContentDetail(row, await this.media.forItem(row), await this.media.original(row));
  }

  /**
   * Soft-deletes the item: gone from every view at once; the `content.purge` job, enqueued in the
   * same transaction, removes its objects and row later. Idempotent:
   * an already deleted item is a no-op, and concurrent deletes audit once (the conditional
   * update changes the row once).
   */
  async delete(a: AccountPrincipal, id: string, requestId?: string): Promise<void> {
    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      // The canonical id comes from the row: the route accepts a UUID in any case.
      const row = await tx.contentItem.findFirst({
        where: { id, collection: ownedBy(a) },
        select: { id: true, collectionId: true },
      });
      if (row === null) throw new AppError('NOT_FOUND', 404);
      await this.deletion.softDelete(tx, row.collectionId, [row.id], a, {
        bulk: false,
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
  }

  /**
   * Deletes up to 100 frames of one collection in one transaction [C7]: one audit event (with
   * `bulk: true`) and one purge job per frame actually deleted. Idempotent: a retry reports the
   * same frames as `alreadyDeleted` and audits nothing again. Ids that are not frames of this
   * collection (another collection's included) are `notFound` and untouched. The ids in the
   * answer, the audit and the jobs come from the rows, never from the request.
   */
  async bulkDelete(
    a: AccountPrincipal,
    collectionId: string,
    ids: readonly string[],
    requestId?: string,
  ): Promise<BulkDeleteContentResponse> {
    // UUIDs compare case-insensitively in PostgreSQL; the answer uses the canonical form.
    const wanted = ids.map((id) => id.toLowerCase());
    await this.jobs.ready();
    return this.prisma.$transaction(async (tx) => {
      const collection = await tx.collection.findFirst({
        where: { id: collectionId, ...ownedBy(a) },
        select: { id: true },
      });
      if (collection === null) throw new AppError('NOT_FOUND', 404);
      const deleted = await this.deletion.softDelete(tx, collection.id, wanted, a, {
        bulk: true,
        ...(requestId === undefined ? {} : { requestId }),
      });
      const justDeleted = new Set(deleted);
      const rows = await tx.contentItem.findMany({
        where: { collectionId: collection.id, id: { in: wanted }, deletedAt: { not: null } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const alreadyDeleted = rows.map((row) => row.id).filter((id) => !justDeleted.has(id));
      const found = new Set([...deleted, ...alreadyDeleted]);
      const notFound = wanted.filter((id) => !found.has(id));
      return { deleted: [...deleted].sort(), alreadyDeleted, notFound };
    });
  }

  private async assertOwnedCollection(a: AccountPrincipal, collectionId: string): Promise<void> {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, ...ownedBy(a) },
      select: { id: true },
    });
    if (collection === null) throw new AppError('NOT_FOUND', 404);
  }
}

/** The owner's collections that still exist for them. */
function ownedBy(a: AccountPrincipal): Prisma.CollectionWhereInput {
  return { ownerId: a.userId, status: { not: 'DELETING' } };
}
