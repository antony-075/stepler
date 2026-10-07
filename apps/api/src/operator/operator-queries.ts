import { Injectable } from '@nestjs/common';
import type {
  OperatorReportDetail,
  OperatorReportListQuery,
  OperatorReportPage,
} from '@stepler/contracts';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { MediaUrls, WITH_MEDIA } from '../content/media-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { moderationOf } from '../moderation/moderation-reads.js';
import { itemState, toOperatorReport, toOperatorReportFields } from './operator-dto.js';

/**
 * The operator console's reads (R5): the report queue and one report with minimal context, the
 * frame, its collection's title and state, the owner's address and state. Never a whole
 * collection, a contributor's name, a file name or a reporter's address.
 */
@Injectable()
export class OperatorQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrls,
  ) {}

  /** One status, newest first, keyset over `(createdAt, id)`; the rest in three batch reads. */
  async reports(query: OperatorReportListQuery): Promise<OperatorReportPage> {
    const position = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (position === null) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
      });
    }
    const rows = await this.prisma.contentReport.findMany({
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
    const contentIds = [...new Set(page.map((row) => row.contentId))];
    const collectionIds = [...new Set(page.map((row) => row.collectionId))];
    const [items, collections, open] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: { id: { in: contentIds } },
        select: {
          id: true,
          kind: true,
          frameNo: true,
          deletedAt: true,
          quarantinedAt: true,
          hiddenAt: true,
        },
      }),
      this.prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, title: true },
      }),
      this.prisma.contentReport.groupBy({
        by: ['contentId'],
        where: { contentId: { in: contentIds }, status: 'OPEN' },
        _count: { _all: true },
      }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    const openById = new Map(open.map((g) => [g.contentId, g._count._all]));
    const last = page.at(-1);
    return {
      items: page.map((row) => {
        const item = itemById.get(row.contentId);
        const collection = collectionById.get(row.collectionId);
        return {
          id: row.id,
          reason: row.reason,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          content:
            item === undefined
              ? null
              : { id: item.id, kind: item.kind, frameNo: item.frameNo, state: itemState(item) },
          collection:
            collection === undefined ? null : { id: collection.id, title: collection.title },
          openReportsOnItem: openById.get(row.contentId) ?? 0,
        };
      }),
      nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async report(id: string): Promise<OperatorReportDetail> {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (report === null) throw new AppError('NOT_FOUND', 404);
    const [others, content, context] = await Promise.all([
      this.prisma.contentReport.findMany({
        where: { contentId: report.contentId, id: { not: report.id } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.content(report.contentId),
      this.collectionContext(report.collectionId),
    ]);
    return {
      report: toOperatorReport(report),
      otherReports: others.map(toOperatorReportFields),
      content,
      ...context,
    };
  }

  /**
   * The frame as the operator sees it (the report and appeal details' content stage); `null` once
   * purged. Nothing is signed for a deleted frame: its purge is under way. A quarantined one keeps
   * its previews (the operator decides on it) but no link to the original (slice 9b).
   */
  async content(contentId: string): Promise<OperatorReportDetail['content']> {
    const item = await this.prisma.contentItem.findUnique({
      where: { id: contentId },
      include: WITH_MEDIA,
    });
    if (item === null) return null;
    const deleted = item.deletedAt !== null;
    const [media, original] = deleted
      ? [null, null]
      : await Promise.all([
          this.media.forItem(item),
          item.quarantinedAt === null
            ? this.media.original(item, { viewer: 'admin', own: false })
            : null,
        ]);
    const moderation = moderationOf(item, 0);
    return {
      id: item.id,
      kind: item.kind,
      frameNo: item.frameNo,
      createdAt: item.createdAt.toISOString(),
      hidden: moderation.hidden,
      quarantined: deleted ? null : moderation.quarantined,
      deleted,
      text: deleted ? null : item.textBody,
      media,
      // A document opens through its download link; photos and videos inline.
      originalUrl: original === null ? null : (original.originalUrl ?? original.downloadUrl),
    };
  }

  /** The minimal collection context: its title and state, the owner's address and state. */
  async collectionContext(
    collectionId: string,
  ): Promise<Pick<OperatorReportDetail, 'collection' | 'owner'>> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: {
        id: true,
        title: true,
        status: true,
        blockedAt: true,
        blockedReason: true,
        owner: { select: { id: true, email: true, status: true, blockedReason: true } },
      },
    });
    if (collection === null) return { collection: null, owner: null };
    return {
      collection: {
        id: collection.id,
        title: collection.title,
        status: collection.status,
        blocked:
          collection.blockedAt === null || collection.blockedReason === null
            ? null
            : { at: collection.blockedAt.toISOString(), reason: collection.blockedReason },
      },
      owner: {
        id: collection.owner.id,
        email: collection.owner.email,
        status: collection.owner.status,
        blockedReason: collection.owner.blockedReason,
      },
    };
  }
}
