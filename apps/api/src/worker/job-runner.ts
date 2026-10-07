import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { JOB_OPTIONS, type JobData, type JobName, singletonKeyFor } from '../jobs/job-names.js';
import { describeError, PgBossClient } from '../jobs/pg-boss-queue.js';
import { CollectionImageDerivativesHandler } from './handlers/collection-image-derivatives.handler.js';
import { DiscardUploadHandler } from './handlers/discard-upload.handler.js';
import { ExpireUploadsHandler } from './handlers/expire-uploads.handler.js';
import { ImageDerivativesHandler } from './handlers/image-derivatives.handler.js';
import { MaintenanceSweepHandler } from './handlers/maintenance-sweep.handler.js';
import { PurgeCollectionHandler } from './handlers/purge-collection.handler.js';
import { PurgeContentHandler } from './handlers/purge-content.handler.js';
import { PurgeCollectionImageHandler } from './handlers/purge-collection-image.handler.js';
import { AppealReceivedMailHandler } from './handlers/appeal-received-mail.handler.js';
import { ReportDecisionMailHandler } from './handlers/report-decision-mail.handler.js';
import { ReportReceivedMailHandler } from './handlers/report-received-mail.handler.js';
import { VideoPosterHandler } from './handlers/video-poster.handler.js';
import { BillingDeletionWarningMailHandler } from './handlers/billing-deletion-warning-mail.handler.js';
import { BillingReadOnlyMailHandler } from './handlers/billing-read-only-mail.handler.js';
import { BillingReconcileHandler } from './handlers/billing-reconcile.handler.js';
import { BillingRetentionHandler } from './handlers/billing-retention.handler.js';
import { type JobHandler, WORKER_ENV } from './job-handler.js';
import type { WorkerEnv } from './worker-env.js';

/** Cron in UTC. A schedule is registered only once its handler exists. */
const SCHEDULES: Partial<Record<JobName, string>> = {
  'uploads.expire': '*/15 * * * *',
  'maintenance.sweep': '7 * * * *',
  // Daily, after the night's backups (ADR 0018 [P6]).
  'billing.retention': '17 3 * * *',
  // Open payments and unapplied callbacks (ADR 0018 [P7]): a lost callback heals within minutes.
  'billing.reconcile': '*/10 * * * *',
};

const POLLING_INTERVAL_SECONDS = 2;

/**
 * Registers a pg-boss worker per handler and the periodic schedules. One job per fetch; media
 * jobs run `WORKER_MEDIA_CONCURRENCY` at a time, the others one at a time.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobRunner.name);
  private readonly handlers: readonly JobHandler[];

  constructor(
    private readonly client: PgBossClient,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'WORKER_MEDIA_CONCURRENCY'>,
    purgeContent: PurgeContentHandler,
    purgeCollection: PurgeCollectionHandler,
    sweep: MaintenanceSweepHandler,
    discardUpload: DiscardUploadHandler,
    expireUploads: ExpireUploadsHandler,
    imageDerivatives: ImageDerivativesHandler,
    videoPoster: VideoPosterHandler,
    imageRenditions: CollectionImageDerivativesHandler,
    purgeImage: PurgeCollectionImageHandler,
    reportReceived: ReportReceivedMailHandler,
    reportDecision: ReportDecisionMailHandler,
    appealReceived: AppealReceivedMailHandler,
    billingRetention: BillingRetentionHandler,
    billingReadOnly: BillingReadOnlyMailHandler,
    billingDeletionWarning: BillingDeletionWarningMailHandler,
    billingReconcile: BillingReconcileHandler,
  ) {
    this.handlers = [
      purgeContent,
      purgeCollection,
      sweep,
      discardUpload,
      expireUploads,
      imageDerivatives,
      videoPoster,
      imageRenditions,
      purgeImage,
      reportReceived,
      reportDecision,
      appealReceived,
      billingRetention,
      billingReadOnly,
      billingDeletionWarning,
      billingReconcile,
    ] as JobHandler[];
  }

  async onApplicationBootstrap(): Promise<void> {
    const boss = await this.client.start();
    for (const handler of this.handlers) {
      await boss.work<JobData[JobName]>(
        handler.name,
        {
          batchSize: 1,
          localConcurrency: handler.name.startsWith('media.')
            ? this.env.WORKER_MEDIA_CONCURRENCY
            : 1,
          pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
        },
        async (jobs) => {
          for (const job of jobs) await this.run(handler, job);
        },
      );
      const cron = SCHEDULES[handler.name];
      if (cron !== undefined) {
        await boss.schedule(handler.name, cron, {}, { singletonKey: handler.name });
      }
    }
    // One sweep now, not at the next hour: after a deploy it starts the location-stripping
    // backfill (ADR 0008 addendum 2026-10-05). Its singleton key dedupes it with a queued one.
    await boss.send(
      'maintenance.sweep',
      {},
      { singletonKey: singletonKeyFor('maintenance.sweep', {}) },
    );
    this.logger.log({ msg: 'worker started', jobs: this.handlers.map((handler) => handler.name) });
  }

  /**
   * Logs ids only: payloads are ids too, but never text, names or file names. A failure of the
   * last attempt (`retryCount` has reached the queue's `retryLimit`) also runs the handler's
   * `onFinalFailure`.
   */
  async run(handler: JobHandler, job: Job<JobData[JobName]>): Promise<void> {
    const context = { jobId: job.id, name: job.name, requestId: job.data.requestId };
    const startedAt = Date.now();
    try {
      await handler.handle(job.data);
      this.logger.log({ msg: 'job done', ...context, durationMs: Date.now() - startedAt });
    } catch (error) {
      const final = job.retryCount >= JOB_OPTIONS[handler.name].retryLimit;
      this.logger.error({ msg: 'job failed', ...context, final, reason: describeError(error) });
      if (final && handler.onFinalFailure !== undefined) {
        await handler.onFinalFailure(job.data).catch((hookError: unknown) => {
          this.logger.error({
            msg: 'job final-failure hook failed',
            ...context,
            reason: describeError(hookError),
          });
        });
      }
      throw error;
    }
  }
}
