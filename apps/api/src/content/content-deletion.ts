import { Inject, Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';

export interface SoftDeleteOptions {
  /** One request deleting several frames (the admin's multi-select) [C7]. */
  bulk: boolean;
  requestId?: string;
  /** The Stepler operator's reason (slice 9), kept in the audit event; never user content. */
  reason?: string;
  /**
   * The sweep ending quarantines (slice 9b): only rows still quarantined past `purgeAfter` are
   * deleted, so a frame restored after the sweep read it is left alone.
   */
  expiredQuarantineOnly?: boolean;
}

/**
 * The one way content is deleted, by the admin, a guest or the Stepler operator: the rows are soft-deleted (gone
 * from every view and from usage at once), and each gets one `content.delete` audit event and
 * one `content.purge` job, all in the caller's transaction. Callers decide who may delete what;
 * the caller also calls `jobs.ready()` before opening that transaction.
 */
@Injectable()
export class ContentDeletion {
  constructor(
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Soft-deletes those of `ids` that are live items of `collectionId` and returns their ids, as
   * stored. The conditional update changes each row once, so a retry or a concurrent delete
   * returns nothing for it and audits nothing. Audit targets and job payloads take ids from the
   * returned rows, never from the request.
   */
  async softDelete(
    tx: Prisma.TransactionClient,
    collectionId: string,
    ids: readonly string[],
    /** `'system'`: the sweep ending a quarantine (slice 9b). */
    actor: AuditActor,
    options: SoftDeleteOptions,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await tx.contentItem.updateManyAndReturn({
      where: {
        collectionId,
        id: { in: [...ids] },
        deletedAt: null,
        ...(options.expiredQuarantineOnly === true
          ? { quarantinedAt: { not: null }, purgeAfter: { lt: new Date() } }
          : {}),
      },
      data: { deletedAt: new Date() },
      select: { id: true, kind: true, frameNo: true },
    });
    const requestId = options.requestId === undefined ? {} : { requestId: options.requestId };
    for (const row of rows) {
      await this.audit.record(tx, {
        collectionId,
        actor,
        action: 'content.delete',
        targetType: 'content',
        targetId: row.id,
        metadata: {
          kind: row.kind,
          frameNo: row.frameNo,
          bulk: options.bulk,
          ...(options.reason === undefined ? {} : { reason: options.reason }),
        },
        ...requestId,
      });
      await this.jobs.enqueue(tx, 'content.purge', { contentItemId: row.id, ...requestId });
    }
    return rows.map((row) => row.id);
  }
}
