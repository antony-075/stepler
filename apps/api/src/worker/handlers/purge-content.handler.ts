import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import { deletePrefix, derivedPrefix } from '../storage-purge.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * Permanently removes a soft-deleted content item (spec §11): its objects first, then the row.
 * An item that is not deleted is left alone: visible content is never purged.
 */
@Injectable()
export class PurgeContentHandler implements JobHandler<'content.purge'> {
  readonly name = 'content.purge';
  private readonly logger = new Logger(PurgeContentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(WORKER_ENV) private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE'>,
  ) {}

  async handle({ contentItemId }: JobData['content.purge']): Promise<void> {
    const item = await this.prisma.contentItem.findUnique({
      where: { id: contentItemId },
      select: { collectionId: true, deletedAt: true },
    });
    if (item === null) return;
    if (item.deletedAt === null) {
      this.logger.warn({ msg: 'content.purge skipped: item is not deleted', contentItemId });
      return;
    }
    // The original's key (MediaObject) joins this list with the upload slice.
    await deletePrefix(
      this.storage,
      derivedPrefix(item.collectionId, contentItemId),
      this.env.WORKER_PURGE_BATCH_SIZE,
    );
    // Conditional: an item can never be purged unless it is still deleted.
    await this.prisma.contentItem.deleteMany({
      where: { id: contentItemId, deletedAt: { not: null } },
    });
  }
}
