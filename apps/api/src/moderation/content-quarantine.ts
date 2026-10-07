import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { HideTarget } from './content-hiding.js';

const DAY_MS = 24 * 3600_000;

/**
 * The Stepler operator's deletion (slice 9b, Q-A1): the frame is quarantined instead of purged.
 * Guests lose it at once (`GUEST_VISIBLE`) and its bytes leave the owner's quota; its admin still
 * sees it (greyed, with the reason and the purge date) and may appeal. The operator restores it
 * (a mistake, or an upheld appeal) until `purgeAfter`; then the hourly sweep soft-deletes it and
 * the usual `content.purge` removes its files. `deletedAt` stays NULL meanwhile, so nothing purges
 * it early.
 *
 * Each change is one conditional `UPDATE`, audited only when it changed the row; callers scope
 * the frame first ([P5]) and run it in their transaction. Admin and guest deletions are not
 * quarantined: they keep the prompt purge.
 */
@Injectable()
export class ContentQuarantine {
  constructor(private readonly audit: AuditService) {}

  /**
   * Quarantines a live frame for `days`. It replaces the operator's own hide (the measure
   * escalates; CHECK "ContentItem_quarantine_not_operator_hidden"); an admin hide stays, so a
   * restore gives the frame back to its admin as it was. A repeat changes nothing.
   */
  async quarantine(
    tx: Prisma.TransactionClient,
    item: HideTarget,
    op: OperatorPrincipal,
    reason: string,
    days: number,
    requestId?: string,
  ): Promise<'quarantined' | 'unchanged'> {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + days * DAY_MS);
    const [row] = await tx.$queryRaw<{ replacedHide: boolean }[]>`
      UPDATE "ContentItem" AS c
         SET "quarantinedAt" = ${now}, "quarantinedByUserId" = ${op.userId}::uuid,
             "quarantineReason" = ${reason}, "purgeAfter" = ${purgeAfter},
             "hiddenAt" = CASE WHEN c."hiddenBy" = 'OPERATOR' THEN NULL ELSE c."hiddenAt" END,
             "hiddenByUserId" = CASE WHEN c."hiddenBy" = 'OPERATOR' THEN NULL ELSE c."hiddenByUserId" END,
             "hiddenReason" = CASE WHEN c."hiddenBy" = 'OPERATOR' THEN NULL ELSE c."hiddenReason" END,
             "hiddenBy" = CASE WHEN c."hiddenBy" = 'OPERATOR' THEN NULL ELSE c."hiddenBy" END
        FROM (SELECT "id", "hiddenBy" = 'OPERATOR' AS "wasOperatorHidden"
                FROM "ContentItem" WHERE "id" = ${item.id}::uuid FOR UPDATE) AS before
       WHERE c."id" = before."id" AND c."deletedAt" IS NULL AND c."quarantinedAt" IS NULL
      RETURNING COALESCE(before."wasOperatorHidden", false) AS "replacedHide"`;
    if (row === undefined) return 'unchanged';
    await this.audit.record(tx, {
      collectionId: item.collectionId,
      actor: op,
      action: 'content.quarantine',
      targetType: 'content',
      targetId: item.id,
      metadata: { reason, purgeAfter: purgeAfter.toISOString(), replacedHide: row.replacedHide },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return 'quarantined';
  }

  /** Ends a quarantine: guests see the frame again (unless its admin hid it). Idempotent. */
  async restore(
    tx: Prisma.TransactionClient,
    item: HideTarget,
    op: OperatorPrincipal,
    reason: string | null,
    requestId?: string,
  ): Promise<'restored' | 'unchanged'> {
    const { count } = await tx.contentItem.updateMany({
      where: { id: item.id, deletedAt: null, quarantinedAt: { not: null } },
      data: {
        quarantinedAt: null,
        quarantinedByUserId: null,
        quarantineReason: null,
        purgeAfter: null,
      },
    });
    if (count === 0) return 'unchanged';
    await this.audit.record(tx, {
      collectionId: item.collectionId,
      actor: op,
      action: 'content.restore',
      targetType: 'content',
      targetId: item.id,
      metadata: { reason },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return 'restored';
  }
}
