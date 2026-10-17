import { Inject, Injectable } from '@nestjs/common';
import { type AuditActor, AuditService } from '../audit/audit.service.js';
import { API_ENV } from '../config/config.module.js';
import type { Prisma } from '../generated/prisma/client.js';
import { collectionPurgeDelaySeconds } from '../jobs/job-names.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';

/**
 * Moves a collection to `DELETING` and enqueues its `collection.purge`, in the caller's
 * transaction (D2): the admin's delete and the billing retention clock (ADR 0018 [P6]) go the
 * same way. The caller has locked the row and knows it is not `DELETING` yet. The purge waits
 * until every upload URL issued before the deletion has expired.
 */
@Injectable()
export class CollectionDeletion {
  constructor(
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(API_ENV) private readonly env: { UPLOAD_URL_TTL_SECONDS: number },
  ) {}

  async markDeleting(
    tx: Prisma.TransactionClient,
    input: {
      collectionId: string;
      fromStatus: 'ACTIVE' | 'ARCHIVED';
      actor: AuditActor;
      requestId?: string;
      /** Extra audit metadata, e.g. `{ reason: 'retention' }`. */
      metadata?: Record<string, string>;
    },
  ): Promise<void> {
    const { collectionId, requestId } = input;
    await tx.collection.update({
      where: { id: collectionId },
      data: { status: 'DELETING', deletionRequestedAt: new Date(), archivedAt: null },
    });
    await this.audit.record(tx, {
      collectionId,
      actor: input.actor,
      action: 'collection.delete',
      targetType: 'collection',
      targetId: collectionId,
      metadata: { fromStatus: input.fromStatus, toStatus: 'DELETING', ...input.metadata },
      ...(requestId === undefined ? {} : { requestId }),
    });
    await this.jobs.enqueue(
      tx,
      'collection.purge',
      { collectionId, ...(requestId === undefined ? {} : { requestId }) },
      { startAfterSeconds: collectionPurgeDelaySeconds(this.env.UPLOAD_URL_TTL_SECONDS) },
    );
  }
}
