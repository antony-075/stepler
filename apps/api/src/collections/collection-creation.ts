import type { AuditActor, AuditService } from '../audit/audit.service.js';
import type { Collection, Prisma } from '../generated/prisma/client.js';
import type { GuestPageRepository } from '../guest-page/guest-page.repository.js';

export interface NewCollection {
  ownerId: string;
  title: string;
  description: string | null;
  /** `PACK` when a paid pack creates it (ADR 0018); the pack row follows in the same transaction. */
  entitlement?: 'ACCOUNT' | 'PACK';
}

/**
 * The collection row, its audit event and its published guest page (ADR 0017), inside the
 * caller's transaction. Shared by the owner's create (`CollectionsService.create`, which checks
 * limits first and adds the default link) and a paid pack that creates its collection.
 */
export async function insertCollection(
  tx: Prisma.TransactionClient,
  deps: { audit: AuditService; pages: GuestPageRepository },
  input: NewCollection,
  actor: AuditActor,
  requestId?: string,
): Promise<Collection> {
  const row = await tx.collection.create({
    data: {
      ownerId: input.ownerId,
      title: input.title,
      description: input.description,
      entitlement: input.entitlement ?? 'ACCOUNT',
    },
  });
  await deps.audit.record(tx, {
    collectionId: row.id,
    actor,
    action: 'collection.create',
    targetType: 'collection',
    targetId: row.id,
    metadata: { toStatus: 'ACTIVE' },
    ...(requestId === undefined ? {} : { requestId }),
  });
  await deps.pages.ensurePublished(tx, row.id);
  return row;
}
