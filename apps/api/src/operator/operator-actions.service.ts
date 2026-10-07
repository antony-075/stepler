import { Injectable, Logger } from '@nestjs/common';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { LimitsService } from '../limits/limits.service.js';
import { BlockingService } from '../moderation/blocking.service.js';
import { ContentHiding } from '../moderation/content-hiding.js';
import { ContentQuarantine } from '../moderation/content-quarantine.js';
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
    private readonly quarantines: ContentQuarantine,
    private readonly blocking: BlockingService,
    private readonly limits: LimitsService,
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

  /**
   * «Видалити (карантин 90 днів)» (slice 9b): gone for guests and from the quota at once, purged
   * after `MODERATION_QUARANTINE_DAYS` unless restored; idempotent.
   */
  async quarantine(op: OperatorPrincipal, contentId: string, reason: string, requestId?: string) {
    const item = await this.liveContent(contentId);
    const days = this.limits.moderation().quarantineDays;
    const result = await this.prisma.$transaction((tx) =>
      this.quarantines.quarantine(tx, item, op, reason, days, requestId),
    );
    if (result === 'quarantined') this.log('content.quarantine', 'content', item.id);
  }

  /** Ends a quarantine before its purge date (an operator mistake); idempotent. */
  async restore(op: OperatorPrincipal, contentId: string, reason: string, requestId?: string) {
    const item = await this.liveContent(contentId);
    const result = await this.prisma.$transaction((tx) =>
      this.quarantines.restore(tx, item, op, reason, requestId),
    );
    if (result === 'restored') this.log('content.restore', 'content', item.id);
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

  /** Hide, unhide, quarantine and restore act on frames that are not deleted. */
  private async liveContent(contentId: string) {
    const item = await this.scope.reportedContent(contentId);
    if (item.deleted) throw new AppError('NOT_FOUND', 404);
    return { id: item.id, collectionId: item.collectionId };
  }

  private log(action: string, targetType: string, targetId: string): void {
    this.logger.log({ msg: 'operator action', action, targetType, targetId });
  }
}
