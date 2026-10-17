import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { renderBillingDeletionWarningEmail } from '../../mail/templates/billing-deletion-warning.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';
import { sendWithoutLeaking } from './report-mail.js';

/**
 * A 30- or 7-day warning before a read-only collection is deleted (ADR 0018 [P6]), to its
 * owner. The retention clock stamped it when enqueueing; a collection whose deletion was lifted
 * meanwhile (or that is already being deleted) sends nothing.
 */
@Injectable()
export class BillingDeletionWarningMailHandler implements JobHandler<'mail.billing-deletion-warning'> {
  readonly name = 'mail.billing-deletion-warning';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'APP_ORIGIN'>,
  ) {}

  async handle({ collectionId }: JobData['mail.billing-deletion-warning']): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: {
        title: true,
        status: true,
        deleteAfter: true,
        owner: { select: { email: true, locale: true, status: true } },
      },
    });
    if (
      collection === null ||
      collection.status === 'DELETING' ||
      collection.deleteAfter === null ||
      collection.owner.status !== 'ACTIVE'
    ) {
      return;
    }
    await sendWithoutLeaking(this.mailer, {
      to: collection.owner.email,
      ...renderBillingDeletionWarningEmail({
        locale: collection.owner.locale,
        title: collection.title,
        deleteAfter: collection.deleteAfter,
        url: `${this.env.APP_ORIGIN}/app/billing`,
      }),
    });
  }
}
