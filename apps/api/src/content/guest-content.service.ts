import { Injectable } from '@nestjs/common';
import type {
  GuestContentDetail,
  GuestContentListQuery,
  GuestContentPage,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { canListAll, canSeeItem } from '../guest-access/guest-policy.js';
import { toGuestContentDetail, toGuestContentItem } from './content-dto.js';
import { ContentQueries } from './content-queries.js';

/**
 * A guest's view of one collection [C16]: always scoped to `principal.collectionId`; their own
 * items, and everyone's only with the shared gallery. Path ids are lookups inside that scope.
 */
@Injectable()
export class GuestContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: ContentQueries,
  ) {}

  async list(p: GuestPrincipal, query: GuestContentListQuery): Promise<GuestContentPage> {
    if (query.scope === 'all' && !canListAll(p)) throw new AppError('FORBIDDEN', 403);
    const where =
      query.scope === 'own'
        ? { collectionId: p.collectionId, contributorGuestSessionId: p.guestSessionId }
        : { collectionId: p.collectionId };
    const { rows, nextCursor } = await this.queries.page(where, query.cursor, query.limit);
    return { items: rows.map((row) => toGuestContentItem(row, p)), nextCursor };
  }

  /** An item the guest may not see is `404`, like one that does not exist. */
  async get(p: GuestPrincipal, id: string): Promise<GuestContentDetail> {
    const row = await this.prisma.contentItem.findFirst({
      where: { id, collectionId: p.collectionId, deletedAt: null },
    });
    if (row === null || !canSeeItem(p, row)) throw new AppError('NOT_FOUND', 404);
    return toGuestContentDetail(row, p);
  }
}
