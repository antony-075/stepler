import { Injectable, Logger } from '@nestjs/common';
import type { ResolveAppealRequest } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { ModerationAppeal, Prisma } from '../generated/prisma/client.js';
import { BlockingService } from './blocking.service.js';
import { ContentHiding } from './content-hiding.js';
import { ContentQuarantine } from './content-quarantine.js';

/** What an upheld appeal changed, logged once the transaction committed. */
type Reversal = 'content.restore' | 'content.unhide' | 'collection.unblock' | null;

/**
 * The operator's decision on an appeal (slice 9b, Q-A4). «Задовольнити» (`UPHELD`) reverses the
 * measure in the same transaction through its own use case (restore a quarantined frame, unhide
 * an operator-hidden one, unblock the collection), each audited as usual; a measure already gone
 * (the frame visible again or deleted) leaves the appeal upheld with nothing to reverse.
 * «Відхилити» (`REJECTED`) keeps the measure. Guest reports are never touched. Idempotent per
 * status; the other decision is `409 APPEAL_RESOLVED`. Callers check the operator's scope.
 */
@Injectable()
export class AppealResolution {
  private readonly logger = new Logger(AppealResolution.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly quarantines: ContentQuarantine,
    private readonly hiding: ContentHiding,
    private readonly blocking: BlockingService,
  ) {}

  async resolve(
    op: OperatorPrincipal,
    appealId: string,
    { status, note }: ResolveAppealRequest,
    requestId?: string,
  ): Promise<void> {
    const requestMeta = requestId === undefined ? {} : { requestId };
    const outcome = await this.prisma.$transaction(async (tx) => {
      const appeal = await tx.moderationAppeal.findUnique({ where: { id: appealId } });
      if (appeal === null) throw new AppError('NOT_FOUND', 404);
      if (appeal.status !== 'OPEN') return assertSame(appeal.status, status);

      const { count } = await tx.moderationAppeal.updateMany({
        where: { id: appeal.id, status: 'OPEN' },
        data: {
          status,
          resolvedByUserId: op.userId,
          resolvedAt: new Date(),
          resolutionNote: note ?? null,
        },
      });
      if (count === 0) {
        // Decided by a concurrent request since it was read.
        const now = await tx.moderationAppeal.findUniqueOrThrow({
          where: { id: appeal.id },
          select: { status: true },
        });
        return assertSame(now.status, status);
      }
      const reversal = status === 'UPHELD' ? await this.reverse(tx, op, appeal, requestId) : null;
      await this.audit.record(tx, {
        collectionId: appeal.collectionId,
        actor: op,
        action: status === 'UPHELD' ? 'appeal.uphold' : 'appeal.reject',
        targetType: 'appeal',
        targetId: appeal.id,
        metadata: {
          targetType: appeal.targetType,
          targetId: appeal.targetId,
          note: note ?? null,
        },
        ...requestMeta,
      });
      return { appeal, reversal };
    });
    if (outcome === null) return;
    this.logger.log({
      msg: 'operator action',
      action: status === 'UPHELD' ? 'appeal.uphold' : 'appeal.reject',
      targetType: 'appeal',
      targetId: outcome.appeal.id,
    });
    if (outcome.reversal === 'collection.unblock') {
      this.blocking.logCollection(false, outcome.appeal.targetId);
    } else if (outcome.reversal !== null) {
      this.logger.log({
        msg: 'operator action',
        action: outcome.reversal,
        targetType: 'content',
        targetId: outcome.appeal.targetId,
      });
    }
  }

  /** Reverses the measure the appeal is against, as it stands now. */
  private async reverse(
    tx: Prisma.TransactionClient,
    op: OperatorPrincipal,
    appeal: ModerationAppeal,
    requestId: string | undefined,
  ): Promise<Reversal> {
    if (appeal.targetType === 'COLLECTION') {
      const exists = await tx.collection.count({
        where: { id: appeal.targetId, status: { not: 'DELETING' } },
      });
      if (exists === 0) return null;
      const changed = await this.blocking.unblockCollectionIn(
        tx,
        op,
        appeal.targetId,
        null,
        requestId,
      );
      return changed ? 'collection.unblock' : null;
    }
    const item = await tx.contentItem.findFirst({
      where: { id: appeal.targetId, deletedAt: null },
      select: { id: true, collectionId: true, hiddenBy: true, quarantinedAt: true },
    });
    if (item === null) return null;
    const target = { id: item.id, collectionId: item.collectionId };
    if (item.quarantinedAt !== null) {
      const result = await this.quarantines.restore(tx, target, op, null, requestId);
      return result === 'restored' ? 'content.restore' : null;
    }
    if (item.hiddenBy === 'OPERATOR') {
      const result = await this.hiding.unhide(tx, target, op, null, requestId);
      return result === 'shown' ? 'content.unhide' : null;
    }
    return null;
  }
}

/** A repeat of the same decision changes nothing; the other decision is a conflict. */
function assertSame(current: string, wanted: string): null {
  if (current !== wanted) throw new AppError('APPEAL_RESOLVED', 409);
  return null;
}
