import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ResolveReportRequest } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';

/**
 * The operator's decision ([P2]): it covers the item, so every `OPEN` report on the same content
 * gets the status and the note, each audited, and each reporter who left an address gets the
 * decision mail (a job per report, in the same transaction). Content actions never change a
 * report's status ([P3]).
 */
@Injectable()
export class ReportResolution {
  private readonly logger = new Logger(ReportResolution.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Idempotent per status: a report already decided the same way is a no-op (`200`), the other
   * way `409 REPORT_RESOLVED`. A concurrent decision on the same item is settled by the
   * conditional update: the loser re-reads and answers by the winner's status.
   */
  async resolve(
    op: OperatorPrincipal,
    reportId: string,
    { status, note }: ResolveReportRequest,
    requestId?: string,
  ): Promise<void> {
    await this.jobs.ready();
    const requestMeta = requestId === undefined ? {} : { requestId };
    const decided = await this.prisma.$transaction(async (tx) => {
      const report = await tx.contentReport.findUnique({
        where: { id: reportId },
        select: { id: true, contentId: true, status: true },
      });
      if (report === null) throw new AppError('NOT_FOUND', 404);
      if (report.status !== 'OPEN') return assertSame(report.status, status);

      const rows = await tx.contentReport.updateManyAndReturn({
        where: { contentId: report.contentId, status: 'OPEN' },
        data: {
          status,
          resolvedByUserId: op.userId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
        select: { id: true, collectionId: true, contentId: true, reporterEmail: true },
      });
      if (!rows.some((row) => row.id === report.id)) {
        // Decided by a concurrent request since it was read.
        const now = await tx.contentReport.findUniqueOrThrow({
          where: { id: report.id },
          select: { status: true },
        });
        assertSame(now.status, status);
      }
      for (const row of rows) {
        await this.audit.record(tx, {
          collectionId: row.collectionId,
          actor: op,
          action: 'report.resolve',
          targetType: 'report',
          targetId: row.id,
          metadata: { contentId: row.contentId, status, note },
          ...requestMeta,
        });
        if (row.reporterEmail !== null) {
          await this.jobs.enqueue(tx, 'mail.report-decision', { reportId: row.id, ...requestMeta });
        }
      }
      return rows.map((row) => row.id);
    });
    for (const id of decided) {
      this.logger.log({
        msg: 'operator action',
        action: 'report.resolve',
        targetType: 'report',
        targetId: id,
      });
    }
  }
}

/** A repeat of the same decision changes nothing; the other decision is a conflict. */
function assertSame(current: string, wanted: string): string[] {
  if (current !== wanted) throw new AppError('REPORT_RESOLVED', 409);
  return [];
}
