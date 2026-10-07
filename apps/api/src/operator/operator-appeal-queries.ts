import { Injectable } from '@nestjs/common';
import type {
  OperatorAppealDetail,
  OperatorAppealListQuery,
  OperatorAppealMeasure,
  OperatorAppealPage,
} from '@stepler/contracts';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { HiddenBy, ModerationAppeal } from '../generated/prisma/client.js';
import { toAdminAppeal } from '../moderation/appeals.service.js';
import { itemState } from './operator-dto.js';
import { OperatorQueries } from './operator-queries.js';

interface MeasureItem {
  deletedAt: Date | null;
  quarantinedAt: Date | null;
  hiddenBy: HiddenBy | null;
}

interface MeasureCollection {
  status: string;
  blockedAt: Date | null;
}

/**
 * The console's appeal queue and detail (slice 9b, Q-A6). The operator reads the admin's text,
 * the measure as it stands now and the same minimal context as a report: the frame, the
 * collection's title and state, the owner's address and state.
 */
@Injectable()
export class OperatorAppealQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: OperatorQueries,
  ) {}

  /** One status, newest first, keyset over `(createdAt, id)`; targets in two batch reads. */
  async appeals(query: OperatorAppealListQuery): Promise<OperatorAppealPage> {
    const position = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (position === null) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
      });
    }
    const rows = await this.prisma.moderationAppeal.findMany({
      where: {
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
    const page = rows.slice(0, query.limit);
    const contentIds = page
      .filter((row) => row.targetType === 'CONTENT')
      .map((row) => row.targetId);
    const collectionIds = [...new Set(page.map((row) => row.collectionId))];
    const [items, collections] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: { id: { in: contentIds } },
        select: {
          id: true,
          kind: true,
          frameNo: true,
          deletedAt: true,
          quarantinedAt: true,
          hiddenAt: true,
          hiddenBy: true,
        },
      }),
      this.prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, title: true, status: true, blockedAt: true },
      }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    const last = page.at(-1);
    return {
      items: page.map((row) => {
        const item = row.targetType === 'CONTENT' ? itemById.get(row.targetId) : undefined;
        const collection = collectionById.get(row.collectionId);
        return {
          id: row.id,
          targetType: row.targetType,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          measure: measureOf(row, item ?? null, collection ?? null),
          content:
            item === undefined
              ? null
              : { id: item.id, kind: item.kind, frameNo: item.frameNo, state: itemState(item) },
          collection:
            collection === undefined ? null : { id: collection.id, title: collection.title },
        };
      }),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async appeal(id: string): Promise<OperatorAppealDetail> {
    const appeal = await this.prisma.moderationAppeal.findUnique({ where: { id } });
    if (appeal === null) throw new AppError('NOT_FOUND', 404);
    const isContent = appeal.targetType === 'CONTENT';
    const [previous, item, collection, content, context, reports] = await Promise.all([
      this.prisma.moderationAppeal.findMany({
        where: { targetType: appeal.targetType, targetId: appeal.targetId, id: { not: appeal.id } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      isContent
        ? this.prisma.contentItem.findUnique({
            where: { id: appeal.targetId },
            select: { deletedAt: true, quarantinedAt: true, hiddenBy: true },
          })
        : null,
      this.prisma.collection.findUnique({
        where: { id: appeal.collectionId },
        select: { status: true, blockedAt: true },
      }),
      isContent ? this.queries.content(appeal.targetId) : null,
      this.queries.collectionContext(appeal.collectionId),
      isContent
        ? this.prisma.contentReport.findMany({
            where: { contentId: appeal.targetId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true, reason: true, status: true, createdAt: true },
          })
        : [],
    ]);
    return {
      // The operator's view has the same fields as the admin's (the text included).
      appeal: toAdminAppeal(appeal),
      previousAppeals: previous.map(toAdminAppeal),
      measure: measureOf(appeal, item, collection),
      content,
      ...context,
      relatedReports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      })),
    };
  }
}

/** What the appeal is against now: reversed, purged or deleted measures are `NONE`. */
function measureOf(
  appeal: Pick<ModerationAppeal, 'targetType'>,
  item: MeasureItem | null,
  collection: MeasureCollection | null,
): OperatorAppealMeasure {
  if (appeal.targetType === 'COLLECTION') {
    return collection !== null && collection.status !== 'DELETING' && collection.blockedAt !== null
      ? 'BLOCKED'
      : 'NONE';
  }
  if (item === null || item.deletedAt !== null) return 'NONE';
  if (item.quarantinedAt !== null) return 'QUARANTINED';
  return item.hiddenBy === 'OPERATOR' ? 'HIDDEN' : 'NONE';
}
