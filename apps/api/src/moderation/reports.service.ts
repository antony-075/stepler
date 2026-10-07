import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateReportRequest } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal, GuestPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { ContentReport, Prisma } from '../generated/prisma/client.js';
import { canReportItem } from '../guest-access/guest-policy.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';
import { GUEST_VISIBLE } from './content-visibility.js';

const HOUR_MS = 3600_000;
/** The unique keys a concurrent double submit can hit; the loser reads the winner's row. */
const REPLAY_CONSTRAINTS = new Set([
  'ContentReport_reporterGuestSessionId_idempotencyKey_key',
  'ContentReport_one_open_per_guest',
]);

/**
 * Guest reports (slice 9, R1) and the admin's dismissal of them ([Q1]). No IP is stored, no
 * automatic action follows a report, and the reporter's e-mail never leaves this table except to
 * the worker's decision mail ([P1]): never in an audit event, a log line or a job payload.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limits: LimitsService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Reports another guest's frame the guest can see (hidden or deleted ones are `404`, their own
   * `403`). Once per `idempotencyKey` (a different body is `409 IDEMPOTENCY_CONFLICT`), and once
   * per open report of this session on the frame ([P4]): both repeats return the first report
   * (`created: false`) and queue no second mail. The row, its audit event and the operator's mail
   * job commit together.
   */
  async create(
    p: GuestPrincipal,
    contentId: string,
    body: CreateReportRequest,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<{ id: string; created: boolean }> {
    await this.jobs.ready();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const item = await tx.contentItem.findFirst({
          where: { id: contentId, collectionId: p.collectionId, ...GUEST_VISIBLE },
          select: { id: true, collectionId: true, contributorGuestSessionId: true },
        });
        if (item === null) throw new AppError('NOT_FOUND', 404);
        const allowed = canReportItem(p, item);
        if (allowed === 'invisible') throw new AppError('NOT_FOUND', 404);
        if (allowed === 'own') throw new AppError('FORBIDDEN', 403);

        const existing = await this.existing(tx, p, item.id, body, idempotencyKey);
        if (existing !== null) return { id: existing, created: false };
        await this.assertWithinHourlyLimit(tx, p);

        const report = await tx.contentReport.create({
          data: {
            contentId: item.id,
            collectionId: item.collectionId,
            reporterGuestSessionId: p.guestSessionId,
            idempotencyKey,
            reason: body.reason,
            description: body.description ?? null,
            // The locale is kept only to write the decision mail, so only with an address [P7].
            reporterEmail: body.email ?? null,
            reporterLocale: body.email === undefined ? null : body.locale,
            requestId: requestId ?? null,
          },
          select: { id: true },
        });
        await this.audit.record(tx, {
          collectionId: item.collectionId,
          actor: p,
          action: 'report.create',
          targetType: 'report',
          targetId: report.id,
          metadata: { contentId: item.id, reason: body.reason },
          ...(requestId === undefined ? {} : { requestId }),
        });
        await this.jobs.enqueue(tx, 'mail.report-received', {
          reportId: report.id,
          ...(requestId === undefined ? {} : { requestId }),
        });
        return { id: report.id, created: true };
      });
      if (result.created) {
        this.logger.log({
          msg: 'report.created',
          reportId: result.id,
          collectionId: p.collectionId,
          reason: body.reason,
          hasContact: body.email !== undefined,
        });
      }
      return { id: result.id, created: result.created };
    } catch (error) {
      const violation = constraintViolation(error);
      if (violation === null || !REPLAY_CONSTRAINTS.has(violation.constraint)) throw error;
      // A concurrent identical submit committed first: answer with its report.
      const winner = await this.existing(this.prisma, p, contentId, body, idempotencyKey);
      if (winner === null) throw error;
      return { id: winner, created: false };
    }
  }

  /**
   * «Відхилити скарги» ([Q1]): clears the admin's mark on one frame of their own collection. The
   * reports stay `OPEN` for the operator, marked as dismissed by the admin. One audit event per
   * report actually dismissed, so a repeat changes and records nothing.
   */
  async dismissForAdmin(a: AccountPrincipal, contentId: string, requestId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.contentItem.findFirst({
        where: {
          id: contentId,
          deletedAt: null,
          // The owner's collections that still exist for them (as `AdminContentService`).
          collection: { ownerId: a.userId, status: { not: 'DELETING' } },
        },
        select: { id: true, collectionId: true },
      });
      if (item === null) throw new AppError('NOT_FOUND', 404);
      const rows = await tx.contentReport.updateManyAndReturn({
        where: { contentId: item.id, status: 'OPEN', adminDismissedAt: null },
        data: { adminDismissedAt: new Date() },
        select: { id: true },
      });
      for (const row of rows) {
        await this.audit.record(tx, {
          collectionId: item.collectionId,
          actor: a,
          action: 'report.admin_dismiss',
          targetType: 'report',
          targetId: row.id,
          metadata: { contentId: item.id },
          ...(requestId === undefined ? {} : { requestId }),
        });
      }
    });
  }

  /**
   * The report this request repeats: the same key (with the same report, else `409`), or this
   * session's open report on the frame ([P4]). `null` when it is a new report.
   */
  private async existing(
    db: Prisma.TransactionClient,
    p: GuestPrincipal,
    contentId: string,
    body: CreateReportRequest,
    idempotencyKey: string,
  ): Promise<string | null> {
    const replay = await db.contentReport.findUnique({
      where: {
        reporterGuestSessionId_idempotencyKey: {
          reporterGuestSessionId: p.guestSessionId,
          idempotencyKey,
        },
      },
    });
    if (replay !== null) {
      if (!sameReport(replay, contentId, body)) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
      return replay.id;
    }
    const open = await db.contentReport.findFirst({
      where: { reporterGuestSessionId: p.guestSessionId, contentId, status: 'OPEN' },
      select: { id: true },
    });
    return open?.id ?? null;
  }

  /**
   * Reports this session sent in the last hour, decided ones included. Concurrent requests may
   * overshoot by their number; a bound on abuse, not a quota (as texts).
   */
  private async assertWithinHourlyLimit(
    tx: Prisma.TransactionClient,
    p: GuestPrincipal,
  ): Promise<void> {
    const recent = await tx.contentReport.aggregate({
      where: {
        reporterGuestSessionId: p.guestSessionId,
        createdAt: { gt: new Date(Date.now() - HOUR_MS) },
      },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    if (recent._count._all < this.limits.forGuestSession().reportsPerHour) return;
    const oldest = recent._min.createdAt?.getTime() ?? Date.now();
    throw new AppError('RATE_LIMITED', 429, {
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + HOUR_MS - Date.now()) / 1000)),
    });
  }
}

/**
 * A replay sends the same report. The address is compared only while it is stored: after the
 * decision mail (or the retention sweep) it is gone, and a late retry is still the same report.
 */
function sameReport(row: ContentReport, contentId: string, body: CreateReportRequest): boolean {
  const emailMatches =
    row.reporterEmail === null ||
    row.reporterEmail.toLowerCase() === (body.email ?? '').toLowerCase();
  return (
    row.contentId === contentId.toLowerCase() &&
    row.reason === body.reason &&
    row.description === (body.description ?? null) &&
    emailMatches
  );
}
