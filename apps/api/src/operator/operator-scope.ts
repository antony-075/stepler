import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';

/** A reported frame the operator may act on. */
export interface ScopedContent {
  id: string;
  collectionId: string;
}

/**
 * The operator's reach ([P5]): only what a report names. A frame with a report, a collection with
 * a report, an account that owns a collection with a report; anything else is `404`, as if it
 * did not exist (unblocking included). One `EXISTS` query each, in SQL.
 */
@Injectable()
export class OperatorScope {
  constructor(private readonly prisma: PrismaService) {}

  /** A reported frame of a collection that still exists; deleted frames too (`deletedAt`). */
  async reportedContent(contentId: string): Promise<ScopedContent & { deleted: boolean }> {
    const [row] = await this.prisma.$queryRaw<
      { id: string; collectionId: string; deleted: boolean }[]
    >`
      SELECT c."id"::text AS "id", c."collectionId"::text AS "collectionId",
             c."deletedAt" IS NOT NULL AS "deleted"
        FROM "ContentItem" c
        JOIN "Collection" col ON col."id" = c."collectionId" AND col."status" <> 'DELETING'
       WHERE c."id" = ${contentId}::uuid
         AND EXISTS (SELECT 1 FROM "ContentReport" r WHERE r."contentId" = c."id")`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  async assertReportedCollection(collectionId: string): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT col."id"::text AS "id" FROM "Collection" col
       WHERE col."id" = ${collectionId}::uuid AND col."status" <> 'DELETING'
         AND EXISTS (SELECT 1 FROM "ContentReport" r WHERE r."collectionId" = col."id")`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    return row.id;
  }

  async assertReportedOwner(userId: string): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u."id"::text AS "id" FROM "User" u
       WHERE u."id" = ${userId}::uuid
         AND EXISTS (
           SELECT 1 FROM "ContentReport" r
             JOIN "Collection" col ON col."id" = r."collectionId"
            WHERE col."ownerId" = u."id")`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    return row.id;
  }
}
