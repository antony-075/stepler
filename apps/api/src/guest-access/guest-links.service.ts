import { Injectable } from '@nestjs/common';
import type {
  CreateGuestLinkRequest,
  GuestLink,
  GuestLinkListResponse,
  GuestLinkPermissions,
  RotateDefaultLinkRequest,
  UpdateGuestLinkRequest,
} from '@stepler/contracts';
import { type AuditAction, type AuditActor, AuditService } from '../audit/audit.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  CollectionStatus,
  GuestLink as GuestLinkRow,
  Prisma,
} from '../generated/prisma/client.js';
import { LimitsService } from '../limits/limits.service.js';
import { DEFAULT_LINK_PERMISSIONS, permissionsOf, toGuestLinkDto } from './guest-link-dto.js';
import { GuestLinkTokens } from './guest-link-tokens.js';

/** Revoking ends a link for good and wipes its token ciphertext [G1]. */
function revoked() {
  return {
    status: 'REVOKED',
    revokedAt: new Date(),
    tokenCiphertext: null,
    tokenKeyId: null,
  } as const;
}

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
    private readonly limits: LimitsService,
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
    await this.record(tx, actor, row, 'guest_link.create', { isDefault: true }, requestId);
    return row;
  }

  /**
   * The live default, then live additional links (oldest first), then the most recently revoked
   * additional links that were not deleted. A collection from before guest links gets its default here [G4], under the
   * collection lock so concurrent first reads create one.
   */
  async list(principal: AccountPrincipal, collectionId: string): Promise<GuestLinkListResponse> {
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
        where: { collectionId, isDefault: false, status: 'REVOKED', hiddenAt: null },
        orderBy: [{ revokedAt: 'desc' }, { id: 'desc' }],
        take: LISTED_REVOKED_LINKS,
      });
      return [...live, ...revoked];
    });
    return { items: rows.map((row) => toGuestLinkDto(row, this.tokens)) };
  }

  /** An additional link, under the collection lock so concurrent creates respect the cap [G8]. */
  async create(
    principal: AccountPrincipal,
    collectionId: string,
    body: CreateGuestLinkRequest,
    requestId?: string,
  ): Promise<GuestLink> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockOwnedCollection(tx, principal, collectionId);
      const live = await tx.guestLink.count({
        where: { collectionId, isDefault: false, status: { not: 'REVOKED' } },
      });
      if (live >= this.limits.forCollection({ id: collectionId }).guestLinks) {
        throw new AppError('GUEST_LINK_LIMIT_REACHED', 409);
      }
      const created = await this.insert(tx, collectionId, {
        isDefault: false,
        label: body.label,
        permissions: body.permissions,
      });
      await this.record(
        tx,
        principal,
        created,
        'guest_link.create',
        { isDefault: false },
        requestId,
      );
      return created;
    });
    return toGuestLinkDto(row, this.tokens);
  }

  /** Label and permissions; last write wins. Guests see the change on their next request. */
  async update(
    principal: AccountPrincipal,
    linkId: string,
    body: UpdateGuestLinkRequest,
    requestId?: string,
  ): Promise<GuestLink> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.findOwnedLink(tx, principal, linkId);
      if (before.status === 'REVOKED') throw new AppError('LINK_REVOKED', 409);
      if (before.isDefault && body.label !== undefined) {
        throw new AppError('VALIDATION_FAILED', 400, {
          errors: [{ path: ['label'], message: 'The default link has no label' }],
        });
      }
      const { count } = await tx.guestLink.updateMany({
        where: { id: linkId, status: { not: 'REVOKED' } },
        data: {
          ...(body.label === undefined ? {} : { label: body.label }),
          ...(body.permissions ?? {}),
        },
      });
      // Revoked by a concurrent request after the read above.
      if (count === 0) throw new AppError('LINK_REVOKED', 409);
      const after = await tx.guestLink.findUniqueOrThrow({ where: { id: linkId } });
      const from = permissionsOf(before);
      const to = permissionsOf(after);
      await this.record(
        tx,
        principal,
        after,
        'guest_link.update',
        {
          ...permissionChange('from', from),
          ...permissionChange('to', to),
          labelChanged: before.label !== after.label,
        },
        requestId,
      );
      return after;
    });
    return toGuestLinkDto(row, this.tokens);
  }

  /** Pause: `ACTIVE` → `INACTIVE`. Idempotent; a revoked link → 409. */
  deactivate(principal: AccountPrincipal, linkId: string, requestId?: string): Promise<GuestLink> {
    return this.transition(principal, linkId, 'ACTIVE', 'INACTIVE', requestId);
  }

  /** Resume: `INACTIVE` → `ACTIVE`. Idempotent; a revoked link → 409. */
  activate(principal: AccountPrincipal, linkId: string, requestId?: string): Promise<GuestLink> {
    return this.transition(principal, linkId, 'INACTIVE', 'ACTIVE', requestId);
  }

  /**
   * Terminal, additional links only (the default is rotated instead). The token ciphertext is
   * wiped, so a revoked token is not stored at all [G1]. Revoking again is a no-op.
   */
  async revoke(
    principal: AccountPrincipal,
    linkId: string,
    requestId?: string,
  ): Promise<GuestLink> {
    const row = await this.prisma.$transaction(async (tx) => {
      const link = await this.findOwnedLink(tx, principal, linkId);
      if (link.isDefault) throw new AppError('DEFAULT_LINK_NOT_REVOCABLE', 409);
      const { count } = await tx.guestLink.updateMany({
        where: { id: linkId, status: { not: 'REVOKED' } },
        data: revoked(),
      });
      const after = await tx.guestLink.findUniqueOrThrow({ where: { id: linkId } });
      if (count === 1) {
        await this.record(
          tx,
          principal,
          after,
          'guest_link.revoke',
          { fromStatus: link.status, toStatus: 'REVOKED' },
          requestId,
        );
      }
      return after;
    });
    return toGuestLinkDto(row, this.tokens);
  }

  /**
   * Deletes an additional link: revokes it if it is still live (the token ciphertext is wiped,
   * as on revoke) and hides it from the list. The row stays for the audit trail and for guest
   * content that will reference it. The default link is replaced, never deleted. Deleting again
   * is a no-op.
   */
  async remove(principal: AccountPrincipal, linkId: string, requestId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const owned = await this.findOwnedLink(tx, principal, linkId);
      if (owned.isDefault) throw new AppError('DEFAULT_LINK_NOT_REVOCABLE', 409);
      // Locked, then read again, so a concurrent revoke, pause or delete cannot slip in between
      // and the delete is audited once. Like the other single-link changes, only the link row.
      await tx.$queryRaw`SELECT "id" FROM "GuestLink" WHERE "id" = ${linkId}::uuid FOR UPDATE`;
      const link = await tx.guestLink.findUniqueOrThrow({ where: { id: linkId } });
      if (link.hiddenAt !== null) return;
      const hiddenAt = new Date();
      await tx.guestLink.update({
        where: { id: linkId },
        data: link.status === 'REVOKED' ? { hiddenAt } : { ...revoked(), hiddenAt },
      });
      await this.record(
        tx,
        principal,
        link,
        'guest_link.delete',
        { fromStatus: link.status },
        requestId,
      );
    });
  }

  /**
   * Replaces the default link's token: the old link is revoked and a new one keeps its
   * permissions and status [G7]. Only when the live default is still `expectedLinkId`, so a
   * retried, doubled or stale request returns the current default without rotating twice.
   */
  async rotateDefault(
    principal: AccountPrincipal,
    collectionId: string,
    body: RotateDefaultLinkRequest,
    requestId?: string,
  ): Promise<GuestLink> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockOwnedCollection(tx, principal, collectionId);
      const current = await this.lockLiveDefault(tx, collectionId);
      if (current === null) return this.createDefault(tx, collectionId, 'system');
      if (current.id !== body.expectedLinkId) return current;

      // Revoke first, so the partial unique index never sees two live defaults.
      await tx.guestLink.update({ where: { id: current.id }, data: revoked() });
      const replacement = await this.insert(tx, collectionId, {
        isDefault: true,
        label: null,
        permissions: permissionsOf(current),
        status: current.status,
      });
      await tx.guestLink.update({
        where: { id: current.id },
        data: { replacedById: replacement.id },
      });
      await this.record(
        tx,
        principal,
        replacement,
        'guest_link.rotate',
        { replacedLinkId: current.id },
        requestId,
      );
      return replacement;
    });
    return toGuestLinkDto(row, this.tokens);
  }

  /** A link of one of the principal's collections that is not `DELETING`; otherwise 404. */
  async findOwnedLink(
    tx: Prisma.TransactionClient,
    principal: AccountPrincipal,
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
   * The live default, locked (`FOR UPDATE`) and then read, so it reflects any pause or permission
   * change that committed while rotate waited, and none can commit until rotate does (a later
   * one finds the link revoked → 409). Lock order: collection, then link. Single-link changes
   * (`update`, `transition`, `revoke`) lock only the link row and never the collection, so the
   * order cannot invert. (`remove` locks the link row alone too.)
   */
  private async lockLiveDefault(
    tx: Prisma.TransactionClient,
    collectionId: string,
  ): Promise<GuestLinkRow | null> {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GuestLink"
      WHERE "collectionId" = ${collectionId}::uuid
        AND "isDefault"
        AND "status" <> 'REVOKED'
      FOR UPDATE`;
    if (locked === undefined) return null;
    return tx.guestLink.findUniqueOrThrow({ where: { id: locked.id } });
  }

  /**
   * Locks one of the principal's collections that is not `DELETING` (`FOR UPDATE`), so changes
   * to its links are serialized; otherwise 404.
   */
  private async lockOwnedCollection(
    tx: Prisma.TransactionClient,
    principal: AccountPrincipal,
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

  /** A conditional status change, audited only when it changed something. */
  private async transition(
    principal: AccountPrincipal,
    linkId: string,
    from: 'ACTIVE' | 'INACTIVE',
    to: 'ACTIVE' | 'INACTIVE',
    requestId: string | undefined,
  ): Promise<GuestLink> {
    const row = await this.prisma.$transaction(async (tx) => {
      const link = await this.findOwnedLink(tx, principal, linkId);
      if (link.status === 'REVOKED') throw new AppError('LINK_REVOKED', 409);
      const { count } = await tx.guestLink.updateMany({
        where: { id: linkId, status: from },
        data: { status: to },
      });
      const after = await tx.guestLink.findUniqueOrThrow({ where: { id: linkId } });
      if (after.status === 'REVOKED') throw new AppError('LINK_REVOKED', 409);
      if (count === 1) {
        await this.record(
          tx,
          principal,
          after,
          to === 'INACTIVE' ? 'guest_link.deactivate' : 'guest_link.activate',
          { fromStatus: from, toStatus: to },
          requestId,
        );
      }
      return after;
    });
    return toGuestLinkDto(row, this.tokens);
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: AuditActor,
    link: GuestLinkRow,
    action: AuditAction,
    metadata: Record<string, string | boolean>,
    requestId: string | undefined,
  ): Promise<void> {
    return this.audit.record(tx, {
      collectionId: link.collectionId,
      actor,
      action,
      targetType: 'guest_link',
      targetId: link.id,
      metadata,
      ...(requestId === undefined ? {} : { requestId }),
    });
  }
}

/** `{ fromCanUploadPhotos: true, … }`: the permission booleans for the audit metadata. */
function permissionChange(prefix: 'from' | 'to', p: GuestLinkPermissions): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(p).map(([key, value]) => [
      `${prefix}${key[0]!.toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  );
}
