import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import { collectionPrefix, deletePrefix } from '../storage-purge.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * Permanently removes a `DELETING` collection (D2): every object under its prefix, in batches,
 * then the row, which cascades to its links, guest sessions and content. Audit events stay (they
 * have no foreign key). Any other status is left alone.
 */
@Injectable()
export class PurgeCollectionHandler implements JobHandler<'collection.purge'> {
  readonly name = 'collection.purge';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE'>,
  ) {}

  async handle({ collectionId }: JobData['collection.purge']): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: { status: true },
    });
    if (collection?.status !== 'DELETING') return;
    // With the upload slice: mark its INITIATED uploads ABORTED and abort their multipart uploads.
    await deletePrefix(
      this.storage,
      collectionPrefix(collectionId),
      this.env.WORKER_PURGE_BATCH_SIZE,
    );
    await this.prisma.collection.deleteMany({ where: { id: collectionId, status: 'DELETING' } });
  }
}
