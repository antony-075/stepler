import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderBillingRenewalFailedEmail } from '../../mail/templates/billing-renewal-failed.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * «Не вдалося списати оплату» to the account's own address (ADR 0018 [P12]). The transition
 * stamps `renewalFailureNotifiedFor` when it enqueues this, so it goes once per period; a
 * renewal that succeeded meanwhile (the subscription left `PAST_DUE`) sends nothing.
 */
@Injectable()
export class BillingRenewalFailedMailHandler implements JobHandler<'mail.billing-renewal-failed'> {
  readonly name = 'mail.billing-renewal-failed';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'APP_ORIGIN'>,
  ) {}

  async handle({ subscriptionId }: JobData['mail.billing-renewal-failed']): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        status: true,
        graceEndsAt: true,
        offer: { select: { titleUk: true, titleEn: true } },
        user: { select: { email: true, locale: true, status: true } },
      },
    });
    if (sub === null || sub.status !== 'PAST_DUE' || sub.graceEndsAt === null) return;
    if (sub.user.status !== 'ACTIVE') return;
    const locale = sub.user.locale;
    await sendWithoutLeaking(this.mailer, {
      to: sub.user.email,
      ...renderBillingRenewalFailedEmail({
        locale,
        plan: locale === 'en' ? sub.offer.titleEn : sub.offer.titleUk,
        graceEndsAt: sub.graceEndsAt,
        url: `${this.env.APP_ORIGIN}/app/billing`,
      }),
    });
  }
}
