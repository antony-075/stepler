import { Inject, Injectable, Logger } from '@nestjs/common';
import { imagePrefix } from '../../images/image-keys.js';

const coverPrefix = (collectionId: string, coverId: string) =>
  imagePrefix(collectionId, 'COVER', coverId);
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import { deletePrefix } from '../storage-purge.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * Removes the objects of a replaced or removed cover [A2]: everything under its own prefix. A
 * cover whose row still exists is never purged (the job would be a mistake, or a replay that
 * raced a new cover with the same id, which cannot happen with UUIDv7 ids). Rerunnable: a run
 * interrupted midway resumes on the next.
 */
@Injectable()
export class PurgeCoverHandler implements JobHandler<'cover.purge'> {
  readonly name = 'cover.purge';
  private readonly logger = new Logger(PurgeCoverHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE'>,
  ) {}

  async handle({ collectionId, coverId }: JobData['cover.purge']): Promise<void> {
    const live = await this.prisma.collectionCover.findUnique({
      where: { id: coverId },
      select: { id: true },
    });
    if (live !== null) {
      this.logger.warn({ msg: 'cover.purge skipped: the cover is live', coverId });
      return;
    }
    // The row is gone, so the stored (lowercase) ids cannot be read back; UUIDs are stored
    // lowercase and storage keys are case-sensitive, hence the normalization.
    await deletePrefix(
      this.storage,
      coverPrefix(collectionId.toLowerCase(), coverId.toLowerCase()),
      this.env.WORKER_PURGE_BATCH_SIZE,
    );
  }
}
