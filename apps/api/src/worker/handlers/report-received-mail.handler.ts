import { Inject, Injectable, Logger } from '@nestjs/common';
import { opsUrl } from '../../config/ops-url.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderReportReceivedEmail } from '../../mail/templates/report-received.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * «Нова скарга» to every `OPERATOR_EMAILS` address (R6, [P1]). Sent at least once: the report
 * is stamped `operatorNotifiedAt` after the sends, so a retry after a partial failure may repeat
 * a message, and a stamped report never mails again.
 */
@Injectable()
export class ReportReceivedMailHandler implements JobHandler<'mail.report-received'> {
  readonly name = 'mail.report-received';
  private readonly logger = new Logger(ReportReceivedMailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'APP_ORIGIN' | 'OPERATOR_EMAILS'>,
  ) {}

  async handle({ reportId }: JobData['mail.report-received']): Promise<void> {
    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
      select: { id: true, reason: true, operatorNotifiedAt: true },
    });
    if (report === null || report.operatorNotifiedAt !== null) return;
    if (this.env.OPERATOR_EMAILS.length === 0) {
      this.logger.warn({ msg: 'report.mail_skipped', reportId, reason: 'no OPERATOR_EMAILS' });
    }
    const mail = renderReportReceivedEmail({
      reason: report.reason,
      url: opsUrl(this.env, `/reports/${report.id}`),
    });
    for (const to of this.env.OPERATOR_EMAILS) {
      await sendWithoutLeaking(this.mailer, { to, ...mail });
    }
    await this.prisma.contentReport.updateMany({
      where: { id: report.id, operatorNotifiedAt: null },
      data: { operatorNotifiedAt: new Date() },
    });
  }
}
