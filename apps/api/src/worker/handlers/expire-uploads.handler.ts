import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/job-queue.js';
import { staleClaimBefore } from '../../uploads/upload-plan.js';
import type { JobHandler } from '../job-handler.js';

/** Uploads closed per run; the next run (every 15 minutes) takes the rest. */
const MAX_PER_RUN = 200;
/** Uploads closed per transaction: a few sends each, far from the transaction timeout. */
const CHUNK = 50;

/**
 * Closes uploads not completed within their TTL (spec §10.5), and those a crashed completion left
 * `COMPLETING` (a stale claim) past their TTL: `EXPIRED`, which frees their
 * quota reservation, and a discard job each, in short transactions of `CHUNK`. Rows a
 * completion holds are skipped (`SKIP LOCKED`) and seen again next run.
 */
@Injectable()
export class ExpireUploadsHandler implements JobHandler<'uploads.expire'> {
  readonly name = 'uploads.expire';
  private readonly logger = new Logger(ExpireUploadsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async handle(): Promise<void> {
    await this.jobs.ready();
    let expired = 0;
    while (expired < MAX_PER_RUN) {
      const closed = await this.prisma.$transaction(async (tx) => {
        // Ids as stored, for the job payloads.
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "UploadSession"
          WHERE "expiresAt" < now()
            AND ("status" = 'INITIATED'
              OR ("status" = 'COMPLETING' AND "claimedAt" < ${staleClaimBefore()}))
          ORDER BY "expiresAt"
          LIMIT ${Math.min(CHUNK, MAX_PER_RUN - expired)}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;
        await tx.uploadSession.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { status: 'EXPIRED', claimedAt: null },
        });
        for (const { id } of rows) {
          await this.jobs.enqueue(tx, 'storage.discard-upload', { uploadSessionId: id });
        }
        return rows.length;
      });
      expired += closed;
      if (closed === 0) break;
    }
    this.logger.log({ msg: 'uploads.expire done', expired });
  }
}
