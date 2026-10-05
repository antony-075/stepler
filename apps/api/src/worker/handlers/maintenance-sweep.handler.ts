import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobData, JobName } from '../../jobs/job-names.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/job-queue.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';

/** Purge jobs normally run within seconds; older leftovers are lost or failed jobs. */
const STALE_AFTER_MS = 3600_000;
const DAY_MS = 24 * 3600_000;
/** Sends per transaction when re-enqueueing purges. */
const ENQUEUE_CHUNK = 50;

/**
 * Hourly safety net (ADR 0009):
 * - re-enqueues `content.purge` / `collection.purge` for items and collections deleted more than
 *   an hour ago (lost or failed jobs, and collections deleted before the worker existed); a job
 *   still queued or running for the same entity makes this a no-op (`exclusive` queues);
 * - marks `FAILED` the photos and videos still `PENDING` an hour after upload with no media job
 *   queued, retrying or running for them (a job pg-boss expired on its last attempt never runs
 *   `onFinalFailure`); they keep their original and show the type tile;
 * - marks `FAILED` the admin images (covers, backgrounds, collection images) still `PENDING` an
 *   hour after they were set with no rendition job queued, retrying or running for them (for
 *   example a job lost while the worker was down during a deploy); the owner can set them again;
 * - backfills location stripping (ADR 0008 addendum 2026-10-05): queues the media job of
 *   `READY` photos, videos and admin images not sanitised yet (uploaded before it existed); the
 *   job then only sanitises their original. Up to `WORKER_PURGE_BATCH_SIZE` of each per run,
 *   oldest first; a job already queued for one makes it a no-op, and a sanitised one is skipped;
 * - deletes guest sessions idle for `GUEST_SESSION_IDLE_DAYS` that contributed nothing and have
 *   no upload rows (open, rejected or done). Their
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
    const [items, collections, unsanitized, unsanitizedImages] = await Promise.all([
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
      // "ContentItem_unsanitized_idx"; a collection being deleted is left to its purge.
      this.prisma.contentItem.findMany({
        where: {
          sanitizedAt: null,
          deletedAt: null,
          kind: { in: ['PHOTO', 'VIDEO'] },
          processingStatus: 'READY',
          collection: { status: { not: 'DELETING' } },
        },
        select: { id: true, kind: true },
        orderBy: { createdAt: 'asc' },
        take,
      }),
      this.prisma.collectionImage.findMany({
        where: {
          sanitizedAt: null,
          status: 'READY',
          collection: { status: { not: 'DELETING' } },
        },
        select: { id: true, collectionId: true },
        orderBy: { createdAt: 'asc' },
        take,
      }),
    ]);
    // Short transactions of a few sends each: one big one could hit the interactive-transaction
    // timeout on a backlog. The session cleanup runs even if enqueueing fails.
    let enqueueError: Error | undefined;
    try {
      await this.enqueueInChunks(
        items,
        ({ id }) => ['content.purge', { contentItemId: id }] as const,
      );
      await this.enqueueInChunks(
        collections,
        ({ id }) => ['collection.purge', { collectionId: id }] as const,
      );
      await this.enqueueInChunks(unsanitized, ({ id, kind }) =>
        kind === 'VIDEO'
          ? (['media.video-poster', { contentItemId: id }] as const)
          : (['media.image-derivatives', { contentItemId: id }] as const),
      );
      await this.enqueueInChunks(
        unsanitizedImages,
        ({ id, collectionId }) =>
          ['media.collection-image', { collectionId, imageId: id }] as const,
      );
    } catch (error) {
      enqueueError = error instanceof Error ? error : new Error('enqueue failed');
    }
    const stalledMedia = await this.failStalledMedia(staleBefore);
    const stalledImages = await this.failStalledImages(staleBefore);
    const idleSessions = await this.deleteIdleGuestSessions();
    this.logger.log({
      msg: 'maintenance.sweep done',
      contentPurges: items.length,
      collectionPurges: collections.length,
      sanitizeBackfill: unsanitized.length + unsanitizedImages.length,
      stalledMediaFailed: stalledMedia,
      stalledImagesFailed: stalledImages,
      idleSessionsDeleted: idleSessions,
    });
    if (enqueueError !== undefined) throw enqueueError;
  }

  /** Media jobs use the singleton key `{name}:{contentItemId}` (`singletonKeyFor`). */
  private failStalledMedia(createdBefore: Date): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "ContentItem" AS item SET "processingStatus" = 'FAILED'
      WHERE item."processingStatus" = 'PENDING'
        AND item."deletedAt" IS NULL
        AND item."createdAt" < ${createdBefore}
        AND NOT EXISTS (
          SELECT 1 FROM pgboss.job AS job
          WHERE job.name IN ('media.image-derivatives', 'media.video-poster')
            AND job.singleton_key = job.name || ':' || item.id::text
            AND job.state IN ('created', 'retry', 'active'))`;
  }

  /**
   * Image jobs use the singleton key `{name}:{imageId}`; the slice 8a queue (covers kept their
   * ids) is checked too until PR L removes it.
   */
  private failStalledImages(createdBefore: Date): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "CollectionImage" AS image SET "status" = 'FAILED'
      WHERE image."status" = 'PENDING'
        AND image."createdAt" < ${createdBefore}
        AND NOT EXISTS (
          SELECT 1 FROM pgboss.job AS job
          WHERE job.name IN ('media.collection-image', 'media.cover-derivatives')
            AND job.singleton_key = job.name || ':' || image.id::text
            AND job.state IN ('created', 'retry', 'active'))`;
  }

  private async enqueueInChunks<R, N extends JobName>(
    rows: readonly R[],
    job: (row: R) => readonly [N, JobData[N]],
  ): Promise<void> {
    for (let start = 0; start < rows.length; start += ENQUEUE_CHUNK) {
      const chunk = rows.slice(start, start + ENQUEUE_CHUNK);
      await this.prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          const [name, data] = job(row);
          await this.jobs.enqueue(tx, name, data);
        }
      });
    }
  }

  /** In batches, so no statement holds many row locks for long. */
  private async deleteIdleGuestSessions(): Promise<number> {
    const idleBefore = new Date(Date.now() - this.env.GUEST_SESSION_IDLE_DAYS * DAY_MS);
    const batch = this.env.WORKER_PURGE_BATCH_SIZE;
    let total = 0;
    for (;;) {
      // A session with any upload is kept too: deleting it would cascade to its upload rows,
      // and an open or rejected upload's bytes could then never be discarded.
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM "GuestSession" WHERE "id" IN (
          SELECT s."id" FROM "GuestSession" s
          WHERE s."lastSeenAt" < ${idleBefore}
            AND NOT EXISTS (
              SELECT 1 FROM "ContentItem" c WHERE c."contributorGuestSessionId" = s."id"
            )
            AND NOT EXISTS (SELECT 1 FROM "UploadSession" u WHERE u."guestSessionId" = s."id")
          LIMIT ${batch}
        )`;
      total += deleted;
      if (deleted < batch) return total;
    }
  }
}
