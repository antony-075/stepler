import { Inject, Injectable } from '@nestjs/common';
import type {
  GuestContentDetail,
  GuestContentListQuery,
  GuestContentPage,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { canDeleteOwn, canListAll, canSeeItem, isOwnItem } from '../guest-access/guest-policy.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { ContentDeletion } from './content-deletion.js';
import { toGuestContentDetail, toGuestContentItem } from './content-dto.js';
import { ContentQueries } from './content-queries.js';
import { MediaUrls, WITH_MEDIA } from './media-urls.js';

/**
 * A guest's view of one collection [C16]: always scoped to `principal.collectionId`; their own
 * items, and everyone's only with the shared gallery. Path ids are lookups inside that scope.
 */
@Injectable()
export class GuestContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ContentQueries,
    private readonly media: MediaUrls,
    private readonly deletion: ContentDeletion,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async list(p: GuestPrincipal, query: GuestContentListQuery): Promise<GuestContentPage> {
    if (query.scope === 'all' && !canListAll(p)) throw new AppError('FORBIDDEN', 403);
    const where =
      query.scope === 'own'
        ? { collectionId: p.collectionId, contributorGuestSessionId: p.guestSessionId }
        : { collectionId: p.collectionId };
    const { rows, nextCursor } = await this.queries.page(where, query.cursor, query.limit);
    const items = await Promise.all(
      rows.map(async (row) => toGuestContentItem(row, p, await this.media.forItem(row))),
    );
    return { items, nextCursor };
  }

  /** An item the guest may not see is `404`, like one that does not exist. */
  async get(p: GuestPrincipal, id: string): Promise<GuestContentDetail> {
    const row = await this.prisma.contentItem.findFirst({
      where: { id, collectionId: p.collectionId, deletedAt: null },
      include: WITH_MEDIA,
    });
    if (row === null || !canSeeItem(p, row)) throw new AppError('NOT_FOUND', 404);
    return toGuestContentDetail(
      row,
      p,
      await this.media.forItem(row),
      await this.media.original(row),
    );
  }

  /**
   * Deletes one of the guest's own items [C15]. Another guest's item, one of another collection
   * or one that never existed are all `404`, before the permission is looked at, so the answer
   * never tells whether someone else's item exists. An own item through a link without
   * `canDeleteOwn` (checked against the link the session is bound to now) is `403`. Already
   * deleted → `204` (idempotent).
   */
  async delete(p: GuestPrincipal, id: string, requestId?: string): Promise<void> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.contentItem.findFirst({
        where: { id, collectionId: p.collectionId },
        select: { id: true, contributorGuestSessionId: true },
      });
      if (row === null || !isOwnItem(p, row)) throw new AppError('NOT_FOUND', 404);
      if (!canDeleteOwn(p)) throw new AppError('FORBIDDEN', 403);
      await this.deletion.softDelete(tx, p.collectionId, [row.id], p, {
        bulk: false,
        ...(requestId === undefined ? {} : { requestId }),
      });
    });
  }
}
