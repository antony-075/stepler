import { Injectable } from '@nestjs/common';
import type { UsageResponse } from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LimitsService } from './limits.service.js';

/** What an account currently uses, measured against `LimitsService` (ADR 0010). */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /**
   * Serializes limit checks per account: concurrent transactions that change the account's
   * usage wait here until the first commits, so a check-then-insert cannot overshoot (§10.3).
   */
  async lockOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  }

  /** Only `ACTIVE` counts toward the limit; archiving frees a slot (D1). */
  activeCollections(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<number> {
    return tx.collection.count({ where: { ownerId: userId, status: 'ACTIVE' } });
  }

  /** Counted from audit events, so deleted collections still count. */
  async collectionCreationsSince(
    userId: string,
    since: Date,
    tx: Prisma.TransactionClient,
  ): Promise<{ count: number; oldest: Date | null }> {
    const where = { actorId: userId, action: 'collection.create', createdAt: { gt: since } };
    const result = await tx.auditEvent.aggregate({
      where,
      _count: { _all: true },
      _min: { createdAt: true },
    });
    return { count: result._count._all, oldest: result._min.createdAt };
  }

  async forUser(userId: string): Promise<UsageResponse> {
    return {
      activeCollections: {
        used: await this.activeCollections(userId),
        limit: this.limits.forUser({ id: userId }).activeCollections,
      },
    };
  }
}
