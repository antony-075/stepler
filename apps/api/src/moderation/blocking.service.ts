import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * The Stepler operator's blocks (R7). Each is one conditional update, audited with the reason
 * only when it changed something, so a repeat is a no-op. Callers check the operator's scope
 * ([P5]) first.
 * - A blocked collection is closed to guests at the one guest choke point (`assertLinkUsable`);
 *   its admin sees the reason and cannot unblock it.
 * - A blocked account loses its sessions at once, cannot sign in, and its collections are closed
 *   to guests. Only the `User` row is locked ([C9] order: nothing else is).
 */
@Injectable()
export class BlockingService {
  private readonly logger = new Logger(BlockingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async blockCollection(
    op: OperatorPrincipal,
    collectionId: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    await this.setCollectionBlock(op, collectionId, reason, requestId);
  }

  async unblockCollection(
    op: OperatorPrincipal,
    collectionId: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    await this.setCollectionBlock(op, collectionId, null, requestId, reason);
  }

  /**
   * The unblock inside the caller's transaction (slice 9b: an upheld appeal reverses the block
   * with its decision). `true` when it changed the collection; the caller logs after commit.
   */
  unblockCollectionIn(
    tx: Prisma.TransactionClient,
    op: OperatorPrincipal,
    collectionId: string,
    reason: string | null,
    requestId?: string,
  ): Promise<boolean> {
    return this.setCollectionBlockIn(tx, op, collectionId, null, requestId, reason);
  }

  private async setCollectionBlock(
    op: OperatorPrincipal,
    collectionId: string,
    blockReason: string | null,
    requestId: string | undefined,
    unblockReason?: string,
  ): Promise<void> {
    const changed = await this.prisma.$transaction((tx) =>
      this.setCollectionBlockIn(tx, op, collectionId, blockReason, requestId, unblockReason),
    );
    if (changed) this.logCollection(blockReason !== null, collectionId);
  }

  /** Logs a block change once it committed (ids only). */
  logCollection(block: boolean, collectionId: string): void {
    this.logger.log({
      msg: 'operator action',
      action: block ? 'collection.block' : 'collection.unblock',
      targetType: 'collection',
      targetId: collectionId,
    });
  }

  private async setCollectionBlockIn(
    tx: Prisma.TransactionClient,
    op: OperatorPrincipal,
    collectionId: string,
    blockReason: string | null,
    requestId: string | undefined,
    unblockReason?: string | null,
  ): Promise<boolean> {
    const block = blockReason !== null;
    const { count } = await tx.collection.updateMany({
      where: {
        id: collectionId,
        status: { not: 'DELETING' },
        blockedAt: block ? null : { not: null },
      },
      data: block
        ? { blockedAt: new Date(), blockedReason: blockReason }
        : { blockedAt: null, blockedReason: null },
    });
    if (count === 0) {
      const exists = await tx.collection.count({
        where: { id: collectionId, status: { not: 'DELETING' } },
      });
      if (exists === 0) throw new AppError('NOT_FOUND', 404);
      return false;
    }
    await this.audit.record(tx, {
      collectionId,
      actor: op,
      action: block ? 'collection.block' : 'collection.unblock',
      targetType: 'collection',
      targetId: collectionId,
      metadata: { reason: blockReason ?? unblockReason ?? null },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return true;
  }

  /** `BLOCKED`, every session revoked; sign-in then answers `ACCOUNT_BLOCKED`. */
  async blockAccount(
    op: OperatorPrincipal,
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    await this.setAccountBlock(op, userId, reason, requestId);
  }

  async unblockAccount(
    op: OperatorPrincipal,
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<void> {
    await this.setAccountBlock(op, userId, null, requestId, reason);
  }

  private async setAccountBlock(
    op: OperatorPrincipal,
    userId: string,
    blockReason: string | null,
    requestId: string | undefined,
    unblockReason?: string,
  ): Promise<void> {
    const block = blockReason !== null;
    const changed = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"::text AS "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new AppError('NOT_FOUND', 404);
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: block ? 'ACTIVE' : 'BLOCKED' },
        data: block
          ? { status: 'BLOCKED', blockedAt: new Date(), blockedReason: blockReason }
          : { status: 'ACTIVE', blockedAt: null, blockedReason: null },
      });
      if (count === 0) return false;
      if (block) await tx.authSession.deleteMany({ where: { userId } });
      await this.audit.record(tx, {
        actor: op,
        action: block ? 'account.block' : 'account.unblock',
        targetType: 'user',
        targetId: userId,
        metadata: { reason: blockReason ?? unblockReason ?? null },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return true;
    });
    if (changed) {
      this.logger.log({
        msg: 'operator action',
        action: block ? 'account.block' : 'account.unblock',
        targetType: 'user',
        targetId: userId,
      });
    }
  }
}
