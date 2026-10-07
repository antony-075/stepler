import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/principal.js';
import type { AuditActorType, Prisma } from '../generated/prisma/client.js';

/** Extended by later slices (content, operator actions). */
export type AuditAction =
  | 'collection.create'
  | 'collection.archive'
  | 'collection.unarchive'
  | 'collection.delete'
  | 'guest_link.create'
  | 'guest_link.update'
  | 'guest_link.deactivate'
  | 'guest_link.activate'
  | 'guest_link.revoke'
  | 'guest_link.delete'
  | 'guest_link.rotate'
  | 'content.delete'
  // Slice 9: moderation (ADR 0013).
  | 'content.hide'
  | 'content.unhide'
  | 'report.create'
  | 'report.admin_dismiss'
  | 'report.resolve'
  | 'collection.block'
  | 'collection.unblock'
  | 'account.block'
  | 'account.unblock'
  // Slice 9b: the operator's deletion is a quarantine; appeals.
  | 'content.quarantine'
  | 'content.restore'
  | 'appeal.create'
  | 'appeal.uphold'
  | 'appeal.reject'
  // Billing (ADR 0018).
  | 'billing.grant'
  | 'billing.grant_revoke'
  | 'billing.checkout'
  | 'billing.payment_succeeded'
  | 'billing.payment_failed'
  | 'billing.payment_reversed';

/** `'system'` is the API acting on its own, e.g. creating a missing default link (G4). */
export type AuditActor = Principal | 'system';

export interface AuditEventInput {
  collectionId?: string;
  actor: AuditActor;
  action: AuditAction;
  targetType:
    | 'collection'
    | 'guest_link'
    | 'content'
    | 'report'
    | 'user'
    | 'appeal'
    | 'subscription'
    | 'payment'
    | 'offer';
  targetId: string;
  /**
   * Ids and states only: never titles, descriptions, labels, texts, names, filenames or other
   * user content, and never tokens or URLs (spec §7.4). The operator's own reasons and notes are
   * allowed (`reason`, `note`): operator-authored text, not user content.
   */
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string;
}

const ACTOR_TYPES: Record<Principal['kind'], AuditActorType> = {
  admin: 'ADMIN',
  operator: 'OPERATOR',
  guest: 'GUEST',
};

/** An account acts as its user; a guest as its guest session (no personal data). */
function actorId(actor: AuditActor): string | null {
  if (actor === 'system') return null;
  return actor.kind === 'guest' ? actor.guestSessionId : actor.userId;
}

/**
 * Appends audit events. It takes the caller's transaction, so an event exists if and only if
 * the change it describes was committed.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, event: AuditEventInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        collectionId: event.collectionId ?? null,
        actorType: event.actor === 'system' ? 'SYSTEM' : ACTOR_TYPES[event.actor.kind],
        actorId: actorId(event.actor),
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata ?? {},
        requestId: event.requestId ?? null,
      },
    });
  }
}
