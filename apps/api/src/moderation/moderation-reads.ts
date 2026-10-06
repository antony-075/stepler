import { Injectable } from '@nestjs/common';
import type { AdminReport, ContentModeration } from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import type { ContentItem, Prisma } from '../generated/prisma/client.js';

/**
 * The admin's open reports: `OPEN` and not dismissed by the admin ([Q1]). Served by the partial
 * `ContentReport_admin_open_idx`.
 */
const ADMIN_OPEN = {
  status: 'OPEN',
  adminDismissedAt: null,
} as const satisfies Prisma.ContentReportWhereInput;

/** What the admin's DTOs need from the moderation tables; never a reporter's contact (R2). */
@Injectable()
export class ModerationReads {
  constructor(private readonly prisma: PrismaService) {}

  /** Open reports per frame, for a whole page in one grouped query (no N+1). */
  async forItems(ids: readonly string[]): Promise<Map<string, { openReports: number }>> {
    const result = new Map<string, { openReports: number }>();
    if (ids.length === 0) return result;
    const groups = await this.prisma.contentReport.groupBy({
      by: ['contentId'],
      where: { contentId: { in: [...ids] }, ...ADMIN_OPEN },
      _count: { _all: true },
    });
    for (const group of groups) result.set(group.contentId, { openReports: group._count._all });
    return result;
  }

  /** One frame's open reports, oldest first: the reason and the description, nothing else. */
  async openReports(contentId: string): Promise<AdminReport[]> {
    const rows = await this.prisma.contentReport.findMany({
      where: { contentId, ...ADMIN_OPEN },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, reason: true, description: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** The frames of a collection with open reports («Скарги» filter). */
  async reportedContentIds(collectionId: string): Promise<string[]> {
    const rows = await this.prisma.contentReport.findMany({
      where: { collectionId, ...ADMIN_OPEN },
      distinct: ['contentId'],
      select: { contentId: true },
    });
    return rows.map((row) => row.contentId);
  }

  /** Non-deleted frames of a collection with open reports (the «Скарги» chip's count). */
  async reportedCount(collectionId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT count(DISTINCT r."contentId")::int AS "count"
        FROM "ContentReport" r
        JOIN "ContentItem" c ON c."id" = r."contentId" AND c."deletedAt" IS NULL
       WHERE r."collectionId" = ${collectionId}::uuid
         AND r."status" = 'OPEN' AND r."adminDismissedAt" IS NULL`;
    return row.count;
  }
}

/** A frame's moderation state for its admin, from its row and `forItems`. */
export function moderationOf(
  row: Pick<ContentItem, 'hiddenAt' | 'hiddenBy' | 'hiddenReason'>,
  openReports: number,
): ContentModeration {
  return {
    hidden:
      row.hiddenAt === null || row.hiddenBy === null
        ? null
        : { by: row.hiddenBy, at: row.hiddenAt.toISOString(), reason: row.hiddenReason },
    openReports,
  };
}
