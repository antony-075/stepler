import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  type AccessResult,
  type AccountSource,
  type EntitlementLimits,
  type PackSource,
  resolveAccess,
  type TrialSource,
} from './domain/access.js';
import { addDays } from './domain/periods.js';

type Db = Prisma.TransactionClient;

/** The seeded trial offer's code (migration `billing_entitlements`). */
export const TRIAL_OFFER_CODE = 'trial';

const PACK_SELECT = {
  offerId: true,
  storageBytes: true,
  guestLinks: true,
  activatedAt: true,
  windowEndsAt: true,
  retentionEndsAt: true,
  offer: { select: { titleUk: true, titleEn: true } },
} as const satisfies Prisma.CollectionPackSelect;

/** What a collection row needs to be resolved without another query. */
export interface CollectionEntitlementRow {
  entitlement: 'ACCOUNT' | 'PACK';
  pack: Prisma.CollectionPackGetPayload<{ select: typeof PACK_SELECT }> | null;
}

/** Include this in a collection query to resolve its access with `forOwnedCollection`. */
export const WITH_PACK = {
  pack: { select: PACK_SELECT },
} as const satisfies Prisma.CollectionInclude;

/**
 * Loads the rows behind access (ADR 0018) and hands them to the pure `resolveAccess`. Every
 * read takes the caller's transaction, so a gate inside a transaction that holds the owner's
 * lock sees a consistent state [C9].
 */
@Injectable()
export class EntitlementResolver {
  constructor(private readonly prisma: PrismaService) {}

  async forAccount(userId: string, tx: Db = this.prisma, now = new Date()): Promise<AccessResult> {
    const [user, subscription, trial] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { trialEndsAt: true } }),
      // The newest plan that ever started (a pending checkout granted nothing yet).
      tx.subscription.findFirst({
        where: { userId, status: { not: 'PENDING' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.trialLimits(tx),
    ]);
    if (user === null) throw new AppError('NOT_FOUND', 404);
    const trialSource: TrialSource | null =
      user.trialEndsAt === null ? null : { endsAt: user.trialEndsAt, limits: trial };
    return resolveAccess({ trial: trialSource, account: toAccountSource(subscription) }, now);
  }

  /** A collection's access and its owner; `NOT_FOUND` for an unknown or deleting one. */
  async forCollection(
    collectionId: string,
    tx: Db = this.prisma,
    now = new Date(),
  ): Promise<
    AccessResult & { collection: { id: string; ownerId: string; entitlement: 'ACCOUNT' | 'PACK' } }
  > {
    const row = await tx.collection.findFirst({
      where: { id: collectionId, status: { not: 'DELETING' } },
      select: { id: true, ownerId: true, entitlement: true, ...WITH_PACK },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    const access = await this.forOwnedCollection(row.ownerId, row, tx, now);
    return {
      ...access,
      collection: { id: row.id, ownerId: row.ownerId, entitlement: row.entitlement },
    };
  }

  /**
   * One collection of a known owner, from a row loaded `WITH_PACK`; the account is read only
   * when the collection takes the account's state. `account` lets a list resolve the account once.
   */
  async forOwnedCollection(
    ownerId: string,
    row: CollectionEntitlementRow,
    tx: Db = this.prisma,
    now = new Date(),
    account?: AccessResult,
  ): Promise<AccessResult> {
    const pack = toPackSource(row);
    if (pack !== null) {
      return resolveAccess(
        { trial: null, account: null, collection: { entitlement: 'PACK', pack } },
        now,
      );
    }
    return account ?? this.forAccount(ownerId, tx, now);
  }

  /** The new account's trial end, from the live trial offer; `null` = no trial offered. */
  async trialEndsAtFor(createdAt: Date, tx: Db = this.prisma): Promise<Date | null> {
    const offer = await tx.billingOffer.findUnique({
      where: { code: TRIAL_OFFER_CODE },
      select: { durationDays: true, active: true },
    });
    if (offer === null || !offer.active || offer.durationDays === null) return null;
    return addDays(createdAt, offer.durationDays);
  }

  /** The trial offer's limits; a trial is not a purchase, so the live row applies (plan "Trial"). */
  private async trialLimits(tx: Db): Promise<EntitlementLimits> {
    const offer = await tx.billingOffer.findUnique({ where: { code: TRIAL_OFFER_CODE } });
    return {
      activeCollections: offer?.activeCollections ?? 0,
      storageBytes: offer?.storageBytes ?? 0n,
      collectionStorageBytes: offer?.collectionStorageBytes ?? 0n,
      guestLinks: offer?.guestLinks ?? 0,
      windowDays: null,
      retentionDays: null,
    };
  }
}

function toAccountSource(row: Prisma.SubscriptionGetPayload<object> | null): AccountSource | null {
  if (row === null) return null;
  return {
    kind: row.source === 'COMPLIMENTARY' ? 'COMPLIMENTARY' : 'SUBSCRIPTION',
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    graceEndsAt: row.graceEndsAt,
    endedAt: row.endedAt,
    limits: {
      activeCollections: row.activeCollections,
      storageBytes: row.storageBytes,
      collectionStorageBytes: row.collectionStorageBytes,
      guestLinks: row.guestLinks,
      windowDays: null,
      retentionDays: null,
    },
  };
}

function toPackSource(row: CollectionEntitlementRow): PackSource | null {
  if (row.entitlement !== 'PACK' || row.pack === null) return null;
  return {
    storageBytes: row.pack.storageBytes,
    guestLinks: row.pack.guestLinks,
    windowEndsAt: row.pack.windowEndsAt,
    retentionEndsAt: row.pack.retentionEndsAt,
  };
}
