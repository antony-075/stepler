import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { AppError } from '../errors/app-error.js';
import type { HiddenBy, Prisma } from '../generated/prisma/client.js';

/** The frame to act on, as its caller already scoped it (owner or operator scope). */
export interface HideTarget {
  id: string;
  collectionId: string;
}

const HIDDEN_BY: Record<AccountPrincipal['kind'], HiddenBy> = {
  admin: 'ADMIN',
  operator: 'OPERATOR',
};

/**
 * Hiding a frame from guests (R3, R5), by its admin or by the Stepler operator. Each change is
 * one conditional `UPDATE`, so concurrent hides and unhides settle on the database and audit only
 * the change that happened. The rules (plan "How the two hides interact"):
 * - the operator's hide wins over the admin's (an admin-hidden frame becomes operator-hidden);
 * - the admin's hide of an operator-hidden frame changes nothing;
 * - the admin cannot unhide an operator-hidden frame (`409 CONTENT_MODERATED`).
 * Callers run it in their transaction after scoping the frame.
 */
@Injectable()
export class ContentHiding {
  constructor(private readonly audit: AuditService) {}

  /** `reason` is required of the operator and ignored for the admin (who hides without one). */
  async hide(
    tx: Prisma.TransactionClient,
    item: HideTarget,
    actor: AccountPrincipal,
    reason: string | null,
    requestId?: string,
  ): Promise<'hidden' | 'unchanged'> {
    const by = HIDDEN_BY[actor.kind];
    if (by === 'OPERATOR' && reason === null) throw new Error('an operator hide needs a reason');
    const { count } = await tx.contentItem.updateMany({
      where:
        by === 'ADMIN'
          ? { id: item.id, deletedAt: null, quarantinedAt: null, hiddenAt: null }
          : // `IS DISTINCT FROM 'OPERATOR'`: visible, or hidden by the admin. A quarantined frame
            // is past hiding (slice 9b): the operator restores it first.
            {
              id: item.id,
              deletedAt: null,
              quarantinedAt: null,
              OR: [{ hiddenBy: null }, { hiddenBy: 'ADMIN' }],
            },
      data: {
        hiddenAt: new Date(),
        hiddenBy: by,
        hiddenByUserId: actor.userId,
        hiddenReason: by === 'OPERATOR' ? reason : null,
      },
    });
    if (count === 0) {
      if (by === 'ADMIN') await this.assertNotQuarantined(tx, item.id);
      return 'unchanged';
    }
    await this.audit.record(tx, {
      collectionId: item.collectionId,
      actor,
      action: 'content.hide',
      targetType: 'content',
      targetId: item.id,
      metadata: by === 'OPERATOR' ? { by, reason } : { by },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return 'hidden';
  }

  /**
   * The admin shows only what the admin hid: an operator-hidden frame is `409 CONTENT_MODERATED`
   * (the one conditional update closes the race with an operator hide). The operator clears any
   * hide.
   */
  async unhide(
    tx: Prisma.TransactionClient,
    item: HideTarget,
    actor: AccountPrincipal,
    reason: string | null,
    requestId?: string,
  ): Promise<'shown' | 'unchanged'> {
    const by = HIDDEN_BY[actor.kind];
    const { count } = await tx.contentItem.updateMany({
      where:
        by === 'ADMIN'
          ? { id: item.id, deletedAt: null, quarantinedAt: null, hiddenBy: 'ADMIN' }
          : { id: item.id, deletedAt: null, hiddenAt: { not: null } },
      data: { hiddenAt: null, hiddenBy: null, hiddenByUserId: null, hiddenReason: null },
    });
    if (count === 0) {
      if (by === 'ADMIN') {
        const row = await tx.contentItem.findUnique({
          where: { id: item.id },
          select: { hiddenBy: true, quarantinedAt: true },
        });
        if (row?.hiddenBy === 'OPERATOR' || (row !== null && row.quarantinedAt !== null)) {
          throw new AppError('CONTENT_MODERATED', 409);
        }
      }
      return 'unchanged';
    }
    await this.audit.record(tx, {
      collectionId: item.collectionId,
      actor,
      action: 'content.unhide',
      targetType: 'content',
      targetId: item.id,
      metadata: by === 'OPERATOR' ? { by, reason } : { by },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return 'shown';
  }

  /** The admin's hide of a frame the operator quarantined: `409`, like an operator hide. */
  private async assertNotQuarantined(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const row = await tx.contentItem.findUnique({ where: { id }, select: { quarantinedAt: true } });
    if (row !== null && row.quarantinedAt !== null) throw new AppError('CONTENT_MODERATED', 409);
  }
}
