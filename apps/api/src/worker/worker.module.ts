import { type DynamicModule, Module } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementResolver } from '../billing/entitlement-resolver.js';
import { CollectionDeletion } from '../collections/collection-deletion.js';
import { ConfigModule } from '../config/config.module.js';
import { ContentDeletion } from '../content/content-deletion.js';
import { DATABASE_POOL_MAX, PrismaService } from '../database/prisma.service.js';
import { JOB_QUEUE } from '../jobs/job-queue.js';
import {
  PG_BOSS_OPTIONS,
  PG_BOSS_SCHEMA,
  PgBossClient,
  PgBossQueue,
} from '../jobs/pg-boss-queue.js';
import { LoggingModule } from '../logging/logging.module.js';
import { MailModule } from '../mail/mail.module.js';
import { OBJECT_STORAGE } from '../storage/object-storage.js';
import { S3ObjectStorage } from '../storage/s3-object-storage.js';
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
import { BillingRetentionHandler } from './handlers/billing-retention.handler.js';
import { WORKER_ENV } from './job-handler.js';
import { JobRunner } from './job-runner.js';
import { DerivativeStore } from './media/derivative-store.js';
import { MediaSlots } from './media/media-slots.js';
import { OriginalSanitizer } from './media/original-sanitizer.js';
import type { WorkerEnv } from './worker-env.js';

/**
 * Connection budget per worker (spike S7): Prisma 5 + pg-boss 5. pg-boss supervises the queues
 * (maintenance, expiry) and runs the cron schedules here, never in the API.
 */
const PRISMA_POOL_MAX = 5;
const PG_BOSS_POOL_MAX = 5;

export interface WorkerModuleOptions {
  env: WorkerEnv;
  logDestination?: DestinationStream;
}

/** The worker: a second entrypoint of the modular monolith (ADR 0009, spec §3), no HTTP. */
@Module({})
export class WorkerModule {
  static forRoot({ env, logDestination }: WorkerModuleOptions): DynamicModule {
    return {
      module: WorkerModule,
      // `MailModule`: the report mail (slice 9, [P1]); SMTP settings as the API's.
      imports: [ConfigModule.forRoot(env), LoggingModule.forRoot(logDestination), MailModule],
      providers: [
        { provide: WORKER_ENV, useValue: env },
        { provide: DATABASE_POOL_MAX, useValue: PRISMA_POOL_MAX },
        PrismaService,
        { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
        {
          provide: PG_BOSS_OPTIONS,
          useValue: {
            connectionString: env.DATABASE_URL,
            schema: PG_BOSS_SCHEMA,
            max: PG_BOSS_POOL_MAX,
          },
        },
        PgBossClient,
        { provide: JOB_QUEUE, useClass: PgBossQueue },
        // The sweep ends expired quarantines the way every deletion goes (slice 9b).
        AuditService,
        ContentDeletion,
        PurgeContentHandler,
        PurgeCollectionHandler,
        MaintenanceSweepHandler,
        DiscardUploadHandler,
        ExpireUploadsHandler,
        DerivativeStore,
        MediaSlots,
        OriginalSanitizer,
        ImageDerivativesHandler,
        VideoPosterHandler,
        CollectionImageDerivativesHandler,
        PurgeCollectionImageHandler,
        ReportReceivedMailHandler,
        ReportDecisionMailHandler,
        AppealReceivedMailHandler,
        // Billing (ADR 0018): the retention clock deletes the way the admin does.
        EntitlementResolver,
        CollectionDeletion,
        BillingRetentionHandler,
        BillingReadOnlyMailHandler,
        BillingDeletionWarningMailHandler,
        JobRunner,
      ],
    };
  }
}
