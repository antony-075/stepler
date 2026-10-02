import { Injectable } from '@nestjs/common';
import type { GuestLinkListResponse, GuestLinkPermissions } from '@stepler/contracts';
import { type AuditActor, AuditService } from '../audit/audit.service.js';
import type { Principal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  CollectionStatus,
  GuestLink as GuestLinkRow,
  Prisma,
} from '../generated/prisma/client.js';
import { DEFAULT_LINK_PERMISSIONS, toGuestLinkDto } from './guest-link-dto.js';
import { GuestLinkTokens } from './guest-link-tokens.js';

/** How many revoked additional links the list keeps showing, most recent first [G8]. */
const LISTED_REVOKED_LINKS = 10;

export type OwnedGuestLink = GuestLinkRow & {
  collection: { id: string; status: CollectionStatus };
};

/**
 * The admin side of guest links. Owner-scoped: every query reaches a link through
 * `collection.ownerId = principal.userId AND collection.status <> 'DELETING'`, and anything else
 * is 404. It never imports the collections module (which imports this one).
 */
@Injectable()
export class GuestLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: GuestLinkTokens,
    private readonly audit: AuditService,
  ) {}

  /** Inserts a collection's default link inside the caller's transaction, and audits it. */
  async createDefault(
    tx: Prisma.TransactionClient,
    collectionId: string,
    actor: AuditActor,
    requestId?: string,
  ): Promise<GuestLinkRow> {
    const row = await this.insert(tx, collectionId, {
      isDefault: true,
      label: null,
      permissions: DEFAULT_LINK_PERMISSIONS,
    });
    await this.audit.record(tx, {
      collectionId,
      actor,
      action: 'guest_link.create',
      targetType: 'guest_link',
      targetId: row.id,
      metadata: { isDefault: true },
      ...(requestId === undefined ? {} : { requestId }),
    });
    return row;
  }

  /**
   * The live default, then live additional links (oldest first), then the most recently revoked
   * additional links. A collection from before guest links gets its default here [G4], under the
   * collection lock so concurrent first reads create one.
   */
  async list(principal: Principal, collectionId: string): Promise<GuestLinkListResponse> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.lockOwnedCollection(tx, principal, collectionId);
      const live = await tx.guestLink.findMany({
        where: { collectionId, status: { not: 'REVOKED' } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!live.some((row) => row.isDefault)) {
        live.unshift(await this.createDefault(tx, collectionId, 'system'));
      }
      const revoked = await tx.guestLink.findMany({
        where: { collectionId, isDefault: false, status: 'REVOKED' },
        orderBy: [{ revokedAt: 'desc' }, { id: 'desc' }],
        take: LISTED_REVOKED_LINKS,
      });
      return [...live, ...revoked];
    });
    return { items: rows.map((row) => toGuestLinkDto(row, this.tokens)) };
  }

  /** A link of one of the principal's collections that is not `DELETING`; otherwise 404. */
  async findOwnedLink(
    tx: Prisma.TransactionClient,
    principal: Principal,
    linkId: string,
  ): Promise<OwnedGuestLink> {
    const row = await tx.guestLink.findFirst({
      where: {
        id: linkId,
        collection: { ownerId: principal.userId, status: { not: 'DELETING' } },
      },
      include: { collection: { select: { id: true, status: true } } },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  /**
   * Locks one of the principal's collections that is not `DELETING` (`FOR UPDATE`), so changes
   * to its links are serialized; otherwise 404.
   */
  private async lockOwnedCollection(
    tx: Prisma.TransactionClient,
    principal: Principal,
    collectionId: string,
  ): Promise<{ id: string; status: CollectionStatus }> {
    const [row] = await tx.$queryRaw<{ id: string; status: CollectionStatus }[]>`
      SELECT "id", "status" FROM "Collection"
      WHERE "id" = ${collectionId}::uuid
        AND "ownerId" = ${principal.userId}::uuid
        AND "status" <> 'DELETING'
      FOR UPDATE`;
    if (row === undefined) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  private insert(
    tx: Prisma.TransactionClient,
    collectionId: string,
    link: {
      isDefault: boolean;
      label: string | null;
      permissions: GuestLinkPermissions;
      status?: GuestLinkRow['status'];
    },
  ): Promise<GuestLinkRow> {
    const { tokenHash, tokenCiphertext, tokenKeyId } = this.tokens.generate();
    return tx.guestLink.create({
      data: {
        collectionId,
        isDefault: link.isDefault,
        label: link.label,
        ...(link.status === undefined ? {} : { status: link.status }),
        tokenHash,
        tokenCiphertext,
        tokenKeyId,
        ...link.permissions,
      },
    });
  }
}
