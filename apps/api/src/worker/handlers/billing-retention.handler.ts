import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AccessResult } from '../../billing/domain/access.js';
import { addDays, addInterval } from '../../billing/domain/periods.js';
import { EntitlementResolver, WITH_PACK } from '../../billing/entitlement-resolver.js';
import { CollectionDeletion } from '../../collections/collection-deletion.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JOB_QUEUE, type JobQueue } from '../../jobs/job-queue.js';
import { type JobHandler, WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';

export interface RetentionRun {
  scheduled: number;
  cleared: number;
  warned30: number;
  warned7: number;
  deleted: number;
}

/**
 * The daily retention clock (ADR 0018 [B8], plan [P5], [P6]). Idempotent and stamp-based, so a
 * second run (or one after a day the worker was down) does only what is still due:
 * 1. clears `deleteAfter` and both warning stamps of collections that are no longer read-only
 *    (a grant, a plan or a pack covers them again), and an account's `readOnlyNotifiedAt` once its
 *    access returned, so a later episode mails again;
 * 2. schedules read-only collections: an account's (trial or plan ended) at `endedAt +
 *    READ_ONLY_RETENTION_MONTHS`, a pack's at its `retentionEndsAt`; the account's owner gets
 *    the «лише перегляд» mail once per episode;
 * 3. sends the 30- and 7-day warnings once each (a late start sends only the 7-day one);
 * 4. with `BILLING_RETENTION_DELETE_ENABLED`, deletes what is due through the admin's deletion
 *    path (actor `SYSTEM`, `{reason: 'retention'}`), never sooner than 7 days after its 7-day
 *    warning, so a late start never shortens the notice.
 * Access is always decided by `EntitlementResolver`; the SQL below only narrows the candidates.
 * Pages of `WORKER_PURGE_BATCH_SIZE`, keyset by id.
 */
@Injectable()
export class BillingRetentionHandler implements JobHandler<'billing.retention'> {
  readonly name = 'billing.retention';
  private readonly logger = new Logger(BillingRetentionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementResolver,
    private readonly deletion: CollectionDeletion,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(WORKER_ENV)
    private readonly env: Pick<
      WorkerEnv,
      'WORKER_PURGE_BATCH_SIZE' | 'READ_ONLY_RETENTION_MONTHS' | 'BILLING_RETENTION_DELETE_ENABLED'
    >,
  ) {}

  async handle(): Promise<void> {
    await this.run(new Date());
  }

  async run(now: Date): Promise<RetentionRun> {
    await this.jobs.ready();
    const result: RetentionRun = { scheduled: 0, cleared: 0, warned30: 0, warned7: 0, deleted: 0 };
    result.cleared = await this.clearRecovered(now);
    result.scheduled = await this.schedule(now);
    const warned = await this.warn(now);
    result.warned30 = warned.warned30;
    result.warned7 = warned.warned7;
    if (this.env.BILLING_RETENTION_DELETE_ENABLED) result.deleted = await this.deleteDue(now);
    this.logger.log({ msg: 'billing.retention done', ...result });
    return result;
  }

  /** Step 1. */
  private async clearRecovered(now: Date): Promise<number> {
    let cleared = 0;
    const accounts = new Map<string, AccessResult>();
    for await (const rows of this.pages((after, take) =>
      this.prisma.collection.findMany({
        where: { deleteAfter: { not: null }, status: { not: 'DELETING' }, id: { gt: after } },
        select: { id: true, ownerId: true, entitlement: true, ...WITH_PACK },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const row of rows) {
        const account = await this.accountOf(row.ownerId, now, accounts);
        const access = await this.entitlements.forOwnedCollection(
          row.ownerId,
          row,
          this.prisma,
          now,
          account,
        );
        if (access.state === 'READ_ONLY') continue;
        const { count } = await this.prisma.collection.updateMany({
          where: { id: row.id, deleteAfter: { not: null } },
          data: { deleteAfter: null, deletionWarnedAt30: null, deletionWarnedAt7: null },
        });
        cleared += count;
      }
    }
    for await (const users of this.pages((after, take) =>
      this.prisma.user.findMany({
        where: { readOnlyNotifiedAt: { not: null }, id: { gt: after } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const user of users) {
        const access = await this.accountOf(user.id, now, accounts);
        if (access.state === 'READ_ONLY') continue;
        await this.prisma.user.updateMany({
          where: { id: user.id },
          data: { readOnlyNotifiedAt: null },
        });
      }
    }
    return cleared;
  }

  /** Step 2. */
  private async schedule(now: Date): Promise<number> {
    let scheduled = 0;
    // Packs past their retention: the bought year is the whole keeping period ([Q2]).
    for await (const rows of this.pages((after, take) =>
      this.prisma.collection.findMany({
        where: {
          id: { gt: after },
          entitlement: 'PACK',
          deleteAfter: null,
          status: { not: 'DELETING' },
          pack: { retentionEndsAt: { lte: now } },
        },
        select: { id: true, pack: { select: { retentionEndsAt: true } } },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const row of rows) {
        if (row.pack === null) continue;
        const { count } = await this.prisma.collection.updateMany({
          where: { id: row.id, deleteAfter: null },
          data: { deleteAfter: row.pack.retentionEndsAt },
        });
        scheduled += count;
      }
    }

    // Accounts whose trial is over and that hold an unscheduled account collection; a plan that
    // is plainly live is skipped here (the resolver decides for the rest).
    for await (const users of this.pages((after, take) =>
      this.prisma.user.findMany({
        where: {
          id: { gt: after },
          OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }],
          collections: {
            some: { entitlement: 'ACCOUNT', deleteAfter: null, status: { not: 'DELETING' } },
          },
          subscriptions: {
            none: {
              OR: [
                { status: 'ACTIVE', source: 'LIQPAY' },
                { status: 'ACTIVE', currentPeriodEnd: null },
                { status: 'ACTIVE', currentPeriodEnd: { gt: now } },
                { status: 'PAST_DUE', graceEndsAt: { gt: now } },
                { status: 'CANCELED', currentPeriodEnd: { gt: now } },
              ],
            },
          },
        },
        select: { id: true, readOnlyNotifiedAt: true },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const user of users) {
        const access = await this.entitlements.forAccount(user.id, this.prisma, now);
        if (access.state !== 'READ_ONLY') continue;
        const deleteAfter = addInterval(
          access.endedAt ?? now,
          'MONTH',
          this.env.READ_ONLY_RETENTION_MONTHS,
        );
        scheduled += await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.collection.updateMany({
            where: {
              ownerId: user.id,
              entitlement: 'ACCOUNT',
              deleteAfter: null,
              status: { not: 'DELETING' },
            },
            data: { deleteAfter },
          });
          const stamped = await tx.user.updateMany({
            where: { id: user.id, readOnlyNotifiedAt: null },
            data: { readOnlyNotifiedAt: now },
          });
          if (stamped.count === 1) {
            await this.jobs.enqueue(tx, 'mail.billing-read-only', { userId: user.id });
          }
          return count;
        });
      }
    }
    return scheduled;
  }

  /** Step 3: the most urgent warning due; a stamp makes each one go out once. */
  private async warn(now: Date): Promise<{ warned30: number; warned7: number }> {
    let warned30 = 0;
    let warned7 = 0;
    for await (const rows of this.pages((after, take) =>
      this.prisma.collection.findMany({
        where: {
          id: { gt: after },
          status: { not: 'DELETING' },
          deleteAfter: { not: null, lte: addDays(now, 30) },
          OR: [{ deletionWarnedAt30: null }, { deletionWarnedAt7: null }],
        },
        select: { id: true, deleteAfter: true, deletionWarnedAt30: true, deletionWarnedAt7: true },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const row of rows) {
        if (row.deleteAfter === null) continue;
        const sevenDue = row.deletionWarnedAt7 === null && row.deleteAfter <= addDays(now, 7);
        const thirtyDue = !sevenDue && row.deletionWarnedAt30 === null;
        if (!sevenDue && !thirtyDue) continue;
        const days = sevenDue ? 7 : 30;
        await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.collection.updateMany({
            where: sevenDue
              ? { id: row.id, deletionWarnedAt7: null, deleteAfter: row.deleteAfter }
              : { id: row.id, deletionWarnedAt30: null, deleteAfter: row.deleteAfter },
            data: sevenDue
              ? { deletionWarnedAt7: now, deletionWarnedAt30: row.deletionWarnedAt30 ?? now }
              : { deletionWarnedAt30: now },
          });
          if (count === 1) {
            await this.jobs.enqueue(tx, 'mail.billing-deletion-warning', {
              collectionId: row.id,
              days,
            });
            if (sevenDue) warned7 += 1;
            else warned30 += 1;
          }
        });
      }
    }
    return { warned30, warned7 };
  }

  /** Step 4. */
  private async deleteDue(now: Date): Promise<number> {
    let deleted = 0;
    for await (const rows of this.pages((after, take) =>
      this.prisma.collection.findMany({
        where: {
          id: { gt: after },
          status: { not: 'DELETING' },
          deleteAfter: { lte: now },
          deletionWarnedAt7: { lte: addDays(now, -7) },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take,
      }),
    )) {
      for (const { id } of rows) {
        deleted += await this.prisma.$transaction(async (tx) => {
          // Locked and read again: a grant or the admin's own delete may have come first.
          const [row] = await tx.$queryRaw<{ status: 'ACTIVE' | 'ARCHIVED' | 'DELETING' }[]>`
            SELECT "status" FROM "Collection"
            WHERE "id" = ${id}::uuid AND "deleteAfter" <= ${now}
              AND "deletionWarnedAt7" <= ${addDays(now, -7)}
            FOR UPDATE`;
          if (row === undefined || row.status === 'DELETING') return 0;
          await this.deletion.markDeleting(tx, {
            collectionId: id,
            fromStatus: row.status,
            actor: 'system',
            metadata: { reason: 'retention' },
          });
          return 1;
        });
      }
    }
    return deleted;
  }

  private async accountOf(
    userId: string,
    now: Date,
    cache: Map<string, AccessResult>,
  ): Promise<AccessResult> {
    const known = cache.get(userId);
    if (known !== undefined) return known;
    const access = await this.entitlements.forAccount(userId, this.prisma, now);
    cache.set(userId, access);
    return access;
  }

  /** Keyset pages of `WORKER_PURGE_BATCH_SIZE`, by id, until a short page. */
  private async *pages<T extends { id: string }>(
    fetch: (after: string, take: number) => Promise<T[]>,
  ): AsyncGenerator<T[]> {
    const take = this.env.WORKER_PURGE_BATCH_SIZE;
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const rows = await fetch(after, take);
      if (rows.length > 0) yield rows;
      const last = rows.at(-1);
      if (rows.length < take || last === undefined) return;
      after = last.id;
    }
  }
}
