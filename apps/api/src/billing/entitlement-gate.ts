import { Injectable } from '@nestjs/common';
import type { GuestContribution } from '@stepler/contracts';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EntitlementResolver } from './entitlement-resolver.js';

type Db = Prisma.TransactionClient;

/**
 * The one write checkpoint for access states (ADR 0018 [P3]). Every service method that adds
 * content, capability or collections calls it first, after its own ownership check (so a
 * stranger still gets `404`, never a state) and, where it locks the owner, after that lock.
 * Reads, downloads, archive, delete, revoke and billing never call it. `GRACE` allows
 * everything. `test/entitlement-gate.e2e.spec.ts` enumerates the router against
 * `GATE_ALLOW_LIST`, so a new write route cannot skip it unnoticed.
 */
@Injectable()
export class EntitlementGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementResolver,
  ) {}

  /**
   * An admin change. Account scope (collection create): `403 ACCOUNT_READ_ONLY`. Collection
   * scope: read-only through the account → `ACCOUNT_READ_ONLY`, through its own pack →
   * `COLLECTION_READ_ONLY`. A pack collection closed to guests (`COLLECTING_CLOSED`) stays
   * editable by its admin [P2].
   */
  async assertAdminCanWrite(
    scope: { userId: string } | { collectionId: string },
    tx: Db = this.prisma,
  ): Promise<void> {
    if ('userId' in scope) {
      const access = await this.entitlements.forAccount(scope.userId, tx);
      if (access.state === 'READ_ONLY') throw new AppError('ACCOUNT_READ_ONLY', 403);
      return;
    }
    const access = await this.entitlements.forCollection(scope.collectionId, tx);
    if (access.state !== 'READ_ONLY') return;
    throw access.collection.entitlement === 'PACK'
      ? new AppError('COLLECTION_READ_ONLY', 403)
      : new AppError('ACCOUNT_READ_ONLY', 403);
  }

  /**
   * A guest's upload initiation or text. One code for any read-only cause, so a guest learns
   * nothing about the owner's account: `403 COLLECTION_READ_ONLY`, or `403 COLLECTING_CLOSED`
   * after a pack's collection window.
   */
  async assertGuestCanContribute(collectionId: string, tx: Db = this.prisma): Promise<void> {
    const contribution = await this.guestContribution(collectionId, tx);
    if (contribution === 'READ_ONLY') throw new AppError('COLLECTION_READ_ONLY', 403);
    if (contribution === 'COLLECTING_CLOSED') throw new AppError('COLLECTING_CLOSED', 403);
  }

  /** What the guest page offers (the guest context's `contribution`). */
  async guestContribution(collectionId: string, tx: Db = this.prisma): Promise<GuestContribution> {
    const { state } = await this.entitlements.forCollection(collectionId, tx);
    if (state === 'READ_ONLY') return 'READ_ONLY';
    if (state === 'COLLECTING_CLOSED') return 'COLLECTING_CLOSED';
    return 'OPEN';
  }
}

/**
 * Mutating routes that are deliberately not gated (plan [P2], [P3]): they remove, pause or
 * revoke, finish an upload already reserved, or are not about content (auth, account, legal,
 * moderation, operator). `"METHOD /path"` as the Express router lists them.
 */
export const GATE_ALLOW_LIST: readonly string[] = [
  // Auth, account and legal acceptance.
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/verification',
  'POST /api/v1/auth/verification/preview',
  'POST /api/v1/auth/verification/confirm',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset',
  'POST /api/v1/auth/password',
  'POST /api/v1/auth/logout',
  'PATCH /api/v1/me',
  'POST /api/v1/me/legal-acceptances',
  // Collections: archive and delete free resources.
  'POST /api/v1/collections/:id/archive',
  'DELETE /api/v1/collections/:id',
  // Content moderation by the admin: delete, hide, unhide, dismiss reports, appeals.
  'POST /api/v1/collections/:id/content/bulk-delete',
  'DELETE /api/v1/content/:id',
  'POST /api/v1/content/:id/hide',
  'POST /api/v1/content/:id/unhide',
  'POST /api/v1/content/:id/reports/dismiss',
  'POST /api/v1/collections/:id/content/:itemId/appeals',
  'POST /api/v1/collections/:id/appeals',
  // Links: pause, revoke, delete, and rotating a leaked default token (a revoke + replace).
  'POST /api/v1/guest-links/:id/deactivate',
  'POST /api/v1/guest-links/:id/revoke',
  'DELETE /api/v1/guest-links/:id',
  'POST /api/v1/collections/:id/guest-links/default/rotate',
  // Guest page and collection image: removing, resetting, and finishing a reserved upload.
  'DELETE /api/v1/collections/:id/guest-page/draft',
  'DELETE /api/v1/collections/:id/guest-page/draft/:slot',
  'POST /api/v1/collections/:id/guest-page/draft/:slot/uploads/:uploadId/parts',
  'POST /api/v1/collections/:id/guest-page/draft/:slot/uploads/:uploadId/complete',
  'DELETE /api/v1/collections/:id/guest-page/draft/:slot/uploads/:uploadId',
  'DELETE /api/v1/collections/:id/image',
  'POST /api/v1/collections/:id/image/uploads/:uploadId/parts',
  'POST /api/v1/collections/:id/image/uploads/:uploadId/complete',
  'DELETE /api/v1/collections/:id/image/uploads/:uploadId',
  // Guests: opening a link, their session, their own deletes, reports, finishing an upload
  // initiated before the cutoff (its space was reserved).
  'POST /api/v1/guest/links/resolve',
  'POST /api/v1/guest/links/theme',
  'POST /api/v1/guest/collections/:collectionId/session',
  'PATCH /api/v1/guest/collections/:collectionId/session',
  'DELETE /api/v1/guest/collections/:collectionId/content/:id',
  'POST /api/v1/guest/collections/:collectionId/content/:id/reports',
  'POST /api/v1/guest/collections/:collectionId/uploads/:uploadId/parts',
  'POST /api/v1/guest/collections/:collectionId/uploads/:uploadId/complete',
  'DELETE /api/v1/guest/collections/:collectionId/uploads/:uploadId',
];

/** Path prefixes allowed wholesale: the operator console and billing itself. */
export const GATE_ALLOW_PREFIXES: readonly string[] = ['/api/v1/operator/', '/api/v1/billing/'];
