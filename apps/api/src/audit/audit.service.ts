import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/principal.js';
import type { AuditActorType, Prisma } from '../generated/prisma/client.js';

/** Extended by later slices (guest links, content, operator actions). */
export type AuditAction =
  'collection.create' | 'collection.archive' | 'collection.unarchive' | 'collection.delete';

export interface AuditEventInput {
  collectionId?: string;
  actor: Principal;
  action: AuditAction;
  targetType: 'collection';
  targetId: string;
  /** Ids and states only: never titles, descriptions or other user content (spec §7.4). */
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string;
}

const ACTOR_TYPES: Record<Principal['kind'], AuditActorType> = {
  admin: 'ADMIN',
  operator: 'OPERATOR',
};

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
        actorType: ACTOR_TYPES[event.actor.kind],
        actorId: event.actor.userId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata ?? {},
        requestId: event.requestId ?? null,
      },
    });
  }
}
