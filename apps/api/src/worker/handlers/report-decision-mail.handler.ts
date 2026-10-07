import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderReportDecisionEmail } from '../../mail/templates/report-decision.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * The decision to a reporter who left an address (R6). The stamp deletes the address and its
 * locale in the same statement ([Q6]): the address exists only to send this one mail.
 */
@Injectable()
export class ReportDecisionMailHandler implements JobHandler<'mail.report-decision'> {
  readonly name = 'mail.report-decision';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'LEGAL_CONTACT_EMAIL'>,
  ) {}

  async handle({ reportId }: JobData['mail.report-decision']): Promise<void> {
    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        status: true,
        reporterEmail: true,
        reporterLocale: true,
        reporterNotifiedAt: true,
      },
    });
    if (
      report === null ||
      report.status === 'OPEN' ||
      report.reporterEmail === null ||
      report.reporterLocale === null ||
      report.reporterNotifiedAt !== null
    ) {
      return;
    }
    const mail = renderReportDecisionEmail({
      status: report.status,
      locale: report.reporterLocale,
      contactEmail: this.env.LEGAL_CONTACT_EMAIL,
    });
    await sendWithoutLeaking(this.mailer, { to: report.reporterEmail, ...mail });
    await this.prisma.contentReport.updateMany({
      where: { id: report.id, reporterNotifiedAt: null },
      data: { reporterNotifiedAt: new Date(), reporterEmail: null, reporterLocale: null },
    });
  }
}
