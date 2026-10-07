import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminAppeal, AppealTargetType } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { ModerationAppeal, Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';

const DAY_MS = 24 * 3600_000;
/** The admin's list (and the blocked banner) needs the latest few only. */
const ADMIN_LIST_LIMIT = 50;
const ONE_OPEN_PER_TARGET = 'ModerationAppeal_one_open_per_target';

/** What an appeal is about, once the admin's scope and the target's state are checked. */
interface AppealTarget {
  collectionId: string;
  targetType: AppealTargetType;
  targetId: string;
}

/**
 * Appeals (slice 9b, Q-A2/Q-A3): the collection admin asks the operator to review a frame the
 * operator hid or quarantined, or the block of their collection. Only the owner of a collection
 * that is not being deleted may appeal (anything else is `404`); a target in no appealable state
 * is `409 APPEAL_NOT_APPLICABLE`; one `OPEN` appeal per target (`409 APPEAL_OPEN`). The row, its
 * audit event (ids only, never the text) and the operator's mail job commit together.
 */
@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limits: LimitsService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  createForContent(
    a: AccountPrincipal,
    collectionId: string,
    contentId: string,
    text: string,
    requestId?: string,
  ): Promise<AdminAppeal> {
    return this.create(a, text, requestId, async (tx) => {
      const item = await tx.contentItem.findFirst({
        where: { id: contentId, collectionId, deletedAt: null, collection: ownedBy(a) },
        select: { id: true, collectionId: true, hiddenBy: true, quarantinedAt: true },
      });
      if (item === null) throw new AppError('NOT_FOUND', 404);
      if (item.hiddenBy !== 'OPERATOR' && item.quarantinedAt === null) {
        throw new AppError('APPEAL_NOT_APPLICABLE', 409);
      }
      return { collectionId: item.collectionId, targetType: 'CONTENT', targetId: item.id };
    });
  }

  createForCollection(
    a: AccountPrincipal,
    collectionId: string,
    text: string,
    requestId?: string,
  ): Promise<AdminAppeal> {
    return this.create(a, text, requestId, async (tx) => {
      const collection = await tx.collection.findFirst({
        where: { id: collectionId, ...ownedBy(a) },
        select: { id: true, blockedAt: true },
      });
      if (collection === null) throw new AppError('NOT_FOUND', 404);
      if (collection.blockedAt === null) throw new AppError('APPEAL_NOT_APPLICABLE', 409);
      return { collectionId: collection.id, targetType: 'COLLECTION', targetId: collection.id };
    });
  }

  /** The collection's appeals (frames and the collection itself), newest first. */
  async listForAdmin(a: AccountPrincipal, collectionId: string): Promise<AdminAppeal[]> {
    const owned = await this.prisma.collection.count({
      where: { id: collectionId, ...ownedBy(a) },
    });
    if (owned === 0) throw new AppError('NOT_FOUND', 404);
    const rows = await this.prisma.moderationAppeal.findMany({
      where: { collectionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_LIST_LIMIT,
    });
    return rows.map(toAdminAppeal);
  }

  /** The latest appeal on a frame, for its detail (the caller has scoped the frame). */
  async latestForContent(contentId: string): Promise<AdminAppeal | null> {
    const row = await this.prisma.moderationAppeal.findFirst({
      where: { targetType: 'CONTENT', targetId: contentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row === null ? null : toAdminAppeal(row);
  }

  private async create(
    a: AccountPrincipal,
    text: string,
    requestId: string | undefined,
    resolveTarget: (tx: Prisma.TransactionClient) => Promise<AppealTarget>,
  ): Promise<AdminAppeal> {
    await this.jobs.ready();
    const requestMeta = requestId === undefined ? {} : { requestId };
    let row: ModerationAppeal;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const target = await resolveTarget(tx);
        const open = await tx.moderationAppeal.count({
          where: { targetType: target.targetType, targetId: target.targetId, status: 'OPEN' },
        });
        if (open > 0) throw new AppError('APPEAL_OPEN', 409);
        await this.assertWithinDailyLimit(tx, a);
        const created = await tx.moderationAppeal.create({
          data: {
            ...target,
            submittedByUserId: a.userId,
            text,
            requestId: requestId ?? null,
          },
        });
        await this.audit.record(tx, {
          collectionId: target.collectionId,
          actor: a,
          action: 'appeal.create',
          targetType: 'appeal',
          targetId: created.id,
          metadata: { targetType: target.targetType, targetId: target.targetId },
          ...requestMeta,
        });
        await this.jobs.enqueue(tx, 'mail.appeal-received', {
          appealId: created.id,
          ...requestMeta,
        });
        return created;
      });
    } catch (error) {
      // A concurrent double submit: the loser hits the partial unique index.
      if (constraintViolation(error)?.constraint === ONE_OPEN_PER_TARGET) {
        throw new AppError('APPEAL_OPEN', 409);
      }
      throw error;
    }
    this.logger.log({
      msg: 'appeal.created',
      appealId: row.id,
      collectionId: row.collectionId,
      targetType: row.targetType,
    });
    return toAdminAppeal(row);
  }

  /**
   * Appeals this account sent in the last 24 hours, decided ones included. Concurrent requests
   * may overshoot by their number; a bound on abuse, not a quota (as reports).
   */
  private async assertWithinDailyLimit(
    tx: Prisma.TransactionClient,
    a: AccountPrincipal,
  ): Promise<void> {
    const recent = await tx.moderationAppeal.aggregate({
      where: { submittedByUserId: a.userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    if (recent._count._all < this.limits.moderation().appealsPerDay) return;
    const oldest = recent._min.createdAt?.getTime() ?? Date.now();
    throw new AppError('RATE_LIMITED', 429, {
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - Date.now()) / 1000)),
    });
  }
}

/** An appeal as its admin sees it: the outcome and the note, never who decided. */
export function toAdminAppeal(row: ModerationAppeal): AdminAppeal {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    status: row.status,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    resolution:
      row.status === 'OPEN' || row.resolvedAt === null
        ? null
        : { status: row.status, note: row.resolutionNote, at: row.resolvedAt.toISOString() },
  };
}

/** The owner's collections that still exist for them (as `AdminContentService`). */
function ownedBy(a: AccountPrincipal): Prisma.CollectionWhereInput {
  return { ownerId: a.userId, status: { not: 'DELETING' } };
}
