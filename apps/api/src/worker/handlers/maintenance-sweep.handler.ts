import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/job-queue.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';

/** Purge jobs normally run within seconds; older leftovers are lost or failed jobs. */
const STALE_AFTER_MS = 3600_000;
const DAY_MS = 24 * 3600_000;

/**
 * Hourly safety net (ADR 0009):
 * - re-enqueues `content.purge` / `collection.purge` for items and collections deleted more than
 *   an hour ago (lost or failed jobs, and collections deleted before the worker existed); a job
 *   still queued or running for the same entity makes this a no-op (`exclusive` queues);
 * - deletes guest sessions idle for `GUEST_SESSION_IDLE_DAYS` that contributed nothing. Their
 *   cookie has expired by then (Max-Age 400 days, renewed on use; `lastSeenAt` is at most an hour
 *   behind), so nobody can come back to them.
 */
@Injectable()
export class MaintenanceSweepHandler implements JobHandler<'maintenance.sweep'> {
  readonly name = 'maintenance.sweep';
  private readonly logger = new Logger(MaintenanceSweepHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(WORKER_ENV)
    private readonly env: Pick<WorkerEnv, 'WORKER_PURGE_BATCH_SIZE' | 'GUEST_SESSION_IDLE_DAYS'>,
  ) {}

  async handle(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const take = this.env.WORKER_PURGE_BATCH_SIZE;
    const [items, collections] = await Promise.all([
      this.prisma.contentItem.findMany({
        where: { deletedAt: { lt: staleBefore } },
        select: { id: true },
        orderBy: { deletedAt: 'asc' },
        take,
      }),
      this.prisma.collection.findMany({
        where: { status: 'DELETING', deletionRequestedAt: { lt: staleBefore } },
        select: { id: true },
        orderBy: { deletionRequestedAt: 'asc' },
        take,
      }),
    ]);
    await this.prisma.$transaction(async (tx) => {
      for (const { id } of items)
        await this.jobs.enqueue(tx, 'content.purge', { contentItemId: id });
      for (const { id } of collections) {
        await this.jobs.enqueue(tx, 'collection.purge', { collectionId: id });
      }
    });
    const idleSessions = await this.deleteIdleGuestSessions();
    this.logger.log({
      msg: 'maintenance.sweep done',
      contentPurges: items.length,
      collectionPurges: collections.length,
      idleSessionsDeleted: idleSessions,
    });
  }

  /** In batches, so no statement holds many row locks for long. */
  private async deleteIdleGuestSessions(): Promise<number> {
    const idleBefore = new Date(Date.now() - this.env.GUEST_SESSION_IDLE_DAYS * DAY_MS);
    const batch = this.env.WORKER_PURGE_BATCH_SIZE;
    let total = 0;
    for (;;) {
      // Upload sessions also reference guest sessions once the upload slice lands; add them here.
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM "GuestSession" WHERE "id" IN (
          SELECT s."id" FROM "GuestSession" s
          WHERE s."lastSeenAt" < ${idleBefore}
            AND NOT EXISTS (
              SELECT 1 FROM "ContentItem" c WHERE c."contributorGuestSessionId" = s."id"
            )
          LIMIT ${batch}
        )`;
      total += deleted;
      if (deleted < batch) return total;
    }
  }
}
