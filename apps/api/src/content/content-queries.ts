import { Injectable } from '@nestjs/common';
import type { AdminContentSort, ContentCounts } from '@stepler/contracts';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { ContentItem, Prisma } from '../generated/prisma/client.js';
import { type MediaRow, WITH_MEDIA } from './media-urls.js';

/** A content row with its stored files (`WITH_MEDIA`). */
export type ContentRow = ContentItem & { mediaObjects: MediaRow[] };

const frameCursorSchema = z.object({ f: z.number().int().min(1) }).strict();

/** Opaque like `encodeCursor`: base64url JSON of the last frame number on the page. */
function encodeFrameCursor(frameNo: number): string {
  return Buffer.from(JSON.stringify({ f: frameNo })).toString('base64url');
}

function decodeFrameCursor(cursor: string): number | null {
  try {
    const parsed = frameCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data.f : null;
  } catch {
    return null;
  }
}

/** The kind counts and the newest time; the state counts come from the moderation module. */
type KindCounts = Omit<ContentCounts, 'active' | 'hiddenByAdmin' | 'hiddenByOperator' | 'reported'>;

const invalidCursor = () =>
  new AppError('VALIDATION_FAILED', 400, {
    errors: [{ path: ['cursor'], message: 'Invalid cursor' }],
  });

/**
 * Content reads shared by the admin and guest views. Callers pass a `where` already scoped to
 * what the principal may see; deleted items are always excluded here.
 */
@Injectable()
export class ContentQueries {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A keyset page. `newest` [C5]: `(createdAt, id)` descending, served by the partial
   * `ContentItem_feed_idx`/`_feed_kind_idx`/`_own_idx`; `frame`: frame number ascending, served by
   * the `(collectionId, frameNo)` unique index. A cursor works only with the order that issued it.
   */
  async page(
    where: Prisma.ContentItemWhereInput,
    cursor: string | undefined,
    limit: number,
    sort: AdminContentSort = 'newest',
  ): Promise<{ rows: ContentRow[]; nextCursor: string | null }> {
    const scoped: Prisma.ContentItemWhereInput = { ...where, deletedAt: null };
    if (sort === 'frame') {
      const after = cursor === undefined ? undefined : decodeFrameCursor(cursor);
      if (after === null) throw invalidCursor();
      const rows = await this.prisma.contentItem.findMany({
        where: after === undefined ? scoped : { ...scoped, frameNo: { gt: after } },
        orderBy: { frameNo: 'asc' },
        take: limit + 1,
        include: WITH_MEDIA,
      });
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const more = rows.length > limit && last !== undefined;
      return { rows: items, nextCursor: more ? encodeFrameCursor(last.frameNo) : null };
    }

    const position = cursor === undefined ? undefined : decodeCursor(cursor);
    if (position === null) throw invalidCursor();
    const rows = await this.prisma.contentItem.findMany({
      where:
        position === undefined
          ? scoped
          : {
              ...scoped,
              OR: [
                { createdAt: { lt: position.createdAt } },
                { createdAt: position.createdAt, id: { lt: position.id } },
              ],
            },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: WITH_MEDIA,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const more = rows.length > limit && last !== undefined;
    return { rows: items, nextCursor: more ? encodeCursor(last) : null };
  }

  /**
   * Non-deleted items by kind and the newest one's time, in one grouped query. The state counts
   * are the moderation module's (`ModerationReads.stateCounts`).
   */
  async counts(collectionId: string): Promise<KindCounts> {
    const groups = await this.prisma.contentItem.groupBy({
      by: ['kind'],
      where: { collectionId, deletedAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const counts: KindCounts = {
      total: 0,
      photo: 0,
      video: 0,
      document: 0,
      text: 0,
      lastAddedAt: null,
    };
    let last: Date | null = null;
    for (const group of groups) {
      const n = group._count._all;
      counts.total += n;
      const key = group.kind.toLowerCase() as 'photo' | 'video' | 'document' | 'text';
      counts[key] = n;
      const newest = group._max.createdAt;
      if (newest !== null && (last === null || newest > last)) last = newest;
    }
    counts.lastAddedAt = last?.toISOString() ?? null;
    return counts;
  }
}
