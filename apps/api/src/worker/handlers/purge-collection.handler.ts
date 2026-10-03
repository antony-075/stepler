import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { collectionPurgeDelaySeconds, type JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import { collectionPrefix, deletePrefix } from '../storage-purge.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * Permanently removes a `DELETING` collection (D2): its open uploads are aborted (their multipart
 * uploads too), every object under its prefix is deleted in batches, then the row, which
 * cascades to its links, guest sessions, uploads and content. Audit events stay (no foreign
 * key). Any other status is left alone.
 *
 * It runs only once `collectionPurgeDelaySeconds` have passed since the deletion (the API
 * schedules it so). Every upload is multipart now and aborting one ends its part URLs, so the
 * delay is a margin rather than the guard it was for single-PUT URLs: S3 lets a part PUT that is
 * already running finish after an abort, and a slow one may run for a while. Discards need no
 * delay (they abort, then delete). A run that comes early (a manual or retried job) skips; the
 * hourly sweep enqueues it again later.
 */
@Injectable()
export class PurgeCollectionHandler implements JobHandler<'collection.purge'> {
  readonly name = 'collection.purge';
  private readonly logger = new Logger(PurgeCollectionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(WORKER_ENV)
    private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE' | 'UPLOAD_URL_TTL_SECONDS'>,
  ) {}

  async handle({ collectionId }: JobData['collection.purge']): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, status: true, deletionRequestedAt: true },
    });
    if (collection?.status !== 'DELETING' || collection.deletionRequestedAt === null) return;
    const delayMs = collectionPurgeDelaySeconds(this.env.UPLOAD_URL_TTL_SECONDS) * 1000;
    if (Date.now() - collection.deletionRequestedAt.getTime() < delayMs) {
      this.logger.log({
        msg: 'collection.purge skipped: upload URLs may still be live',
        collectionId,
      });
      return;
    }
    await this.abortOpenUploads(collection.id);
    await deletePrefix(
      this.storage,
      // The stored (lowercase) id: storage keys are case-sensitive, a payload id may not be.
      collectionPrefix(collection.id),
      this.env.WORKER_PURGE_BATCH_SIZE,
    );
    await this.prisma.collection.deleteMany({ where: { id: collection.id, status: 'DELETING' } });
  }

  /** Open uploads become `ABORTED`; their multipart uploads are aborted in storage. */
  private async abortOpenUploads(collectionId: string): Promise<void> {
    const open = await this.prisma.uploadSession.findMany({
      where: { collectionId, status: 'INITIATED' },
      select: { id: true, storageKey: true, multipartUploadId: true },
    });
    for (const upload of open) {
      await this.storage.abortMultipart(upload.storageKey, upload.multipartUploadId);
    }
    await this.prisma.uploadSession.updateMany({
      where: { id: { in: open.map((upload) => upload.id) }, status: 'INITIATED' },
      data: { status: 'ABORTED' },
    });
  }
}
