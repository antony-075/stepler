import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OperatorPrincipal } from '../auth/principal.js';
import { ContentDeletion } from '../content/content-deletion.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { BlockingService } from '../moderation/blocking.service.js';
import { ContentHiding } from '../moderation/content-hiding.js';
import { OperatorScope } from './operator-scope.js';

/**
 * The operator's actions on content, collections and accounts (R5): each checks the reported
 * scope first ([P5]), needs a reason, and is audited by the moderation use case it calls. Logs
 * ids and the action only, never the reason.
 */
@Injectable()
export class OperatorActions {
  private readonly logger = new Logger(OperatorActions.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: OperatorScope,
    private readonly hiding: ContentHiding,
    private readonly deletion: ContentDeletion,
    private readonly blocking: BlockingService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /** Hides a live frame (an admin hide becomes the operator's); a repeat changes nothing. */
  async hide(op: OperatorPrincipal, contentId: string, reason: string, requestId?: string) {
    const item = await this.liveContent(contentId);
    const result = await this.prisma.$transaction((tx) =>
      this.hiding.hide(tx, item, op, reason, requestId),
    );
    if (result === 'hidden') this.log('content.hide', 'content', item.id);
  }

  /** Shows a frame whoever hid it; a repeat changes nothing. */
  async unhide(op: OperatorPrincipal, contentId: string, reason: string, requestId?: string) {
    const item = await this.liveContent(contentId);
    const result = await this.prisma.$transaction((tx) =>
      this.hiding.unhide(tx, item, op, reason, requestId),
    );
    if (result === 'shown') this.log('content.unhide', 'content', item.id);
  }

  /** Deletes a frame as the admin would (purge job, audit with the reason); idempotent. */
  async delete(op: OperatorPrincipal, contentId: string, reason: string, requestId?: string) {
    const item = await this.scope.reportedContent(contentId);
    await this.jobs.ready();
    const deleted = await this.prisma.$transaction((tx) =>
      this.deletion.softDelete(tx, item.collectionId, [item.id], op, {
        bulk: false,
        reason,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
    if (deleted.length > 0) this.log('content.delete', 'content', item.id);
  }

  async blockCollection(op: OperatorPrincipal, id: string, reason: string, requestId?: string) {
    await this.blocking.blockCollection(
      op,
      await this.scope.assertReportedCollection(id),
      reason,
      requestId,
    );
  }

  async unblockCollection(op: OperatorPrincipal, id: string, reason: string, requestId?: string) {
    await this.blocking.unblockCollection(
      op,
      await this.scope.assertReportedCollection(id),
      reason,
      requestId,
    );
  }

  async blockAccount(op: OperatorPrincipal, id: string, reason: string, requestId?: string) {
    await this.blocking.blockAccount(
      op,
      await this.scope.assertReportedOwner(id),
      reason,
      requestId,
    );
  }

  async unblockAccount(op: OperatorPrincipal, id: string, reason: string, requestId?: string) {
    await this.blocking.unblockAccount(
      op,
      await this.scope.assertReportedOwner(id),
      reason,
      requestId,
    );
  }

  /** Hide and unhide act on frames that are not deleted. */
  private async liveContent(contentId: string) {
    const item = await this.scope.reportedContent(contentId);
    if (item.deleted) throw new AppError('NOT_FOUND', 404);
    return { id: item.id, collectionId: item.collectionId };
  }

  private log(action: string, targetType: string, targetId: string): void {
    this.logger.log({ msg: 'operator action', action, targetType, targetId });
  }
}
