import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminContentDetail,
  AdminContentListQuery,
  AdminContentPage,
  ContentCounts,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
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
    private readonly audit: AuditService,
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
        select: { id: true, collectionId: true, kind: true, frameNo: true },
      });
      if (row === null) throw new AppError('NOT_FOUND', 404);
      const { count } = await tx.contentItem.updateMany({
        where: { id: row.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) return;
      await this.audit.record(tx, {
        collectionId: row.collectionId,
        actor: a,
        action: 'content.delete',
        targetType: 'content',
        targetId: row.id,
        metadata: { kind: row.kind, frameNo: row.frameNo, bulk: false },
        ...(requestId === undefined ? {} : { requestId }),
      });
      await this.jobs.enqueue(tx, 'content.purge', {
        contentItemId: row.id,
        ...(requestId === undefined ? {} : { requestId }),
      });
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
