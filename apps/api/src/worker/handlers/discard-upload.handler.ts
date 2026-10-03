import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';

/**
 * Removes the bytes of an upload that will never become content (spec §10.5): a rejected,
 * cancelled or expired upload's multipart upload is aborted and its object deleted. Any other
 * status, or a missing row, is left alone: a completed upload's original is never discarded.
 */
@Injectable()
export class DiscardUploadHandler implements JobHandler<'storage.discard-upload'> {
  readonly name = 'storage.discard-upload';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async handle({ uploadSessionId }: JobData['storage.discard-upload']): Promise<void> {
    const row = await this.prisma.uploadSession.findUnique({
      where: { id: uploadSessionId },
      select: { status: true, storageKey: true, multipartUploadId: true },
    });
    if (row === null) return;
    if (row.status !== 'REJECTED' && row.status !== 'ABORTED' && row.status !== 'EXPIRED') return;
    if (row.multipartUploadId !== null) {
      await this.storage.abortMultipart(row.storageKey, row.multipartUploadId);
    }
    await this.storage.delete(row.storageKey);
  }
}
