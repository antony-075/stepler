import { Inject, Injectable } from '@nestjs/common';
import { EntitlementResolver } from '../../billing/entitlement-resolver.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderBillingReadOnlyEmail } from '../../mail/templates/billing-read-only.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * «Колекції доступні лише для перегляду» to the account's own address (ADR 0018 [B8]). The
 * retention clock stamps `readOnlyNotifiedAt` when it enqueues this, so it goes once per
 * episode; access that came back meanwhile (a grant, a plan) sends nothing.
 */
@Injectable()
export class BillingReadOnlyMailHandler implements JobHandler<'mail.billing-read-only'> {
  readonly name = 'mail.billing-read-only';

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementResolver,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'APP_ORIGIN'>,
  ) {}

  async handle({ userId }: JobData['mail.billing-read-only']): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, locale: true, status: true },
    });
    if (user === null || user.status !== 'ACTIVE') return;
    const access = await this.entitlements.forAccount(userId);
    if (access.state !== 'READ_ONLY') return;
    const first = await this.prisma.collection.findFirst({
      where: { ownerId: userId, entitlement: 'ACCOUNT', deleteAfter: { not: null } },
      orderBy: { deleteAfter: 'asc' },
      select: { deleteAfter: true },
    });
    if (first?.deleteAfter == null) return;
    await sendWithoutLeaking(this.mailer, {
      to: user.email,
      ...renderBillingReadOnlyEmail({
        locale: user.locale,
        reason: access.reason === 'TRIAL_ENDED' ? 'trial' : 'plan',
        deleteAfter: first.deleteAfter,
        url: `${this.env.APP_ORIGIN}/app/billing`,
      }),
    });
  }
}
