import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { imagePrefix } from '../../images/image-keys.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import { deletePrefix } from '../storage-purge.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * Removes the objects of an image nothing references any more (plan Task 8): everything under
 * its own prefix. An image whose row still exists is never purged (the API deletes the row in the
 * transaction that drops its last reference, so a live row means the job is a mistake).
 * Rerunnable: a run interrupted midway resumes on the next.
 */
@Injectable()
export class PurgeCollectionImageHandler implements JobHandler<'collection-image.purge'> {
  readonly name = 'collection-image.purge';
  private readonly logger = new Logger(PurgeCollectionImageHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE'>,
  ) {}

  async handle({ collectionId, imageId, slot }: JobData['collection-image.purge']): Promise<void> {
    const live = await this.prisma.collectionImage.findUnique({
      where: { id: imageId },
      select: { id: true },
    });
    if (live !== null) {
      this.logger.warn({ msg: 'collection-image.purge skipped: the image is live', imageId });
      return;
    }
    // The row is gone, so the stored (lowercase) ids cannot be read back; UUIDs are stored
    // lowercase and storage keys are case-sensitive, hence the normalization.
    await deletePrefix(
      this.storage,
      imagePrefix(collectionId.toLowerCase(), slot, imageId.toLowerCase()),
      this.env.WORKER_PURGE_BATCH_SIZE,
    );
  }
}
