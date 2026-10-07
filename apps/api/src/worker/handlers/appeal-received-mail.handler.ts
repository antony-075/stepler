import { Inject, Injectable, Logger } from '@nestjs/common';
import { opsUrl } from '../../config/ops-url.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderAppealReceivedEmail } from '../../mail/templates/appeal-received.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * «Нова апеляція» to every `OPERATOR_EMAILS` address (slice 9b, Q-A5), as the report mail: sent
 * at least once, the appeal stamped `operatorNotifiedAt` after the sends, so a stamped appeal
 * never mails again. No mail ever goes to the admin.
 */
@Injectable()
export class AppealReceivedMailHandler implements JobHandler<'mail.appeal-received'> {
  readonly name = 'mail.appeal-received';
  private readonly logger = new Logger(AppealReceivedMailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'APP_ORIGIN' | 'OPERATOR_EMAILS'>,
  ) {}

  async handle({ appealId }: JobData['mail.appeal-received']): Promise<void> {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      select: { id: true, targetType: true, operatorNotifiedAt: true },
    });
    if (appeal === null || appeal.operatorNotifiedAt !== null) return;
    if (this.env.OPERATOR_EMAILS.length === 0) {
      this.logger.warn({ msg: 'appeal.mail_skipped', appealId, reason: 'no OPERATOR_EMAILS' });
    }
    const mail = renderAppealReceivedEmail({
      targetType: appeal.targetType,
      url: opsUrl(this.env, `/appeals/${appeal.id}`),
    });
    for (const to of this.env.OPERATOR_EMAILS) {
      await sendWithoutLeaking(this.mailer, { to, ...mail });
    }
    await this.prisma.moderationAppeal.updateMany({
      where: { id: appeal.id, operatorNotifiedAt: null },
      data: { operatorNotifiedAt: new Date() },
    });
  }
}
