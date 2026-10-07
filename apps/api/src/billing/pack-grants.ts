import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { insertCollection } from '../collections/collection-creation.js';
import type { Payment, Prisma } from '../generated/prisma/client.js';
import { GuestPageRepository } from '../guest-page/guest-page.repository.js';
import { addDays, laterOf } from './domain/periods.js';
import { readSnapshot } from './offer-snapshot.js';

type Db = Prisma.TransactionClient;

/**
 * Creates a new collection's default guest link inside the caller's transaction. The API binds
 * it to `GuestLinksService.createDefault`; the worker has no `APP_SECRET` to mint link tokens, so
 * it binds nothing and the link is created on the owner's first visit instead (backstop G4).
 */
export const DEFAULT_LINK_CREATOR = Symbol('DEFAULT_LINK_CREATOR');
export interface DefaultLinkCreator {
  createDefault(tx: Db, collectionId: string, actor: 'system'): Promise<unknown>;
}

/** `granted`: the pack or extension is in force; `review`: nothing granted, for the operator. */
export type GrantResult = 'granted' | 'review';

const SCHEDULE_CLEARED = { deleteAfter: null, deletionWarnedAt30: null, deletionWarnedAt7: null };

/**
 * What a successful pack payment grants (ADR 0018 [P4]): the pack's clocks start at the payment;
 * an extension moves a clock from `max(paidAt, its end)`; a storage upgrade moves the pack to
 * the bigger tier. Every grant lifts a scheduled deletion ([P5]). Called only by
 * `PaymentTransitions`, inside its transaction, after the owner and collection locks.
 */
@Injectable()
export class PackGrants {
  constructor(
    private readonly audit: AuditService,
    private readonly pages: GuestPageRepository,
    @Optional() @Inject(DEFAULT_LINK_CREATOR) private readonly links?: DefaultLinkCreator,
  ) {}

  async applyPack(tx: Db, payment: Payment, paidAt: Date): Promise<GrantResult> {
    const snapshot = readSnapshot(payment.offerSnapshot);
    let collectionId = payment.collectionId;
    if (collectionId === null) {
      // A pack that creates its collection; without a title the target is gone (purged).
      if (payment.newCollectionTitle === null) return 'review';
      const row = await insertCollection(
        tx,
        { audit: this.audit, pages: this.pages },
        {
          ownerId: payment.userId,
          title: payment.newCollectionTitle,
          description: null,
          entitlement: 'PACK',
        },
        'system',
      );
      await this.links?.createDefault(tx, row.id, 'system');
      await tx.payment.update({ where: { id: payment.id }, data: { collectionId: row.id } });
      collectionId = row.id;
    } else {
      const target = await tx.collection.findUnique({
        where: { id: collectionId },
        select: { status: true, entitlement: true },
      });
      // A second pack for the same collection (or one being deleted): never granted twice.
      if (target === null || target.status === 'DELETING' || target.entitlement !== 'ACCOUNT') {
        return 'review';
      }
      await tx.collection.update({
        where: { id: collectionId },
        data: { entitlement: 'PACK', ...SCHEDULE_CLEARED },
      });
    }
    await tx.collectionPack.create({
      data: {
        collectionId,
        offerId: payment.offerId,
        storageBytes: BigInt(snapshot.collectionStorageBytes ?? '0'),
        guestLinks: snapshot.guestLinks ?? 0,
        activatedAt: paidAt,
        windowEndsAt: addDays(paidAt, snapshot.windowDays ?? 0),
        retentionEndsAt: addDays(paidAt, snapshot.retentionDays ?? 0),
      },
    });
    return 'granted';
  }

  async applyExtension(tx: Db, payment: Payment, paidAt: Date): Promise<GrantResult> {
    if (payment.collectionId === null) return 'review';
    const snapshot = readSnapshot(payment.offerSnapshot);
    const collection = await tx.collection.findUnique({
      where: { id: payment.collectionId },
      select: {
        status: true,
        entitlement: true,
        pack: {
          select: {
            id: true,
            windowEndsAt: true,
            retentionEndsAt: true,
            guestLinks: true,
            offer: { select: { rank: true } },
          },
        },
      },
    });
    const pack = collection?.pack;
    if (
      collection === null ||
      collection.status === 'DELETING' ||
      collection.entitlement !== 'PACK' ||
      pack === null ||
      pack === undefined
    ) {
      return 'review';
    }
    let data: Prisma.CollectionPackUpdateInput;
    if (snapshot.extension === 'WINDOW') {
      const windowEndsAt = addDays(laterOf(paidAt, pack.windowEndsAt), snapshot.windowDays ?? 0);
      // Collecting never outlasts keeping ("CollectionPack_clock_order").
      data = { windowEndsAt, retentionEndsAt: laterOf(pack.retentionEndsAt, windowEndsAt) };
    } else if (snapshot.extension === 'RETENTION') {
      data = {
        retentionEndsAt: addDays(
          laterOf(paidAt, pack.retentionEndsAt),
          snapshot.retentionDays ?? 0,
        ),
      };
    } else {
      // A storage upgrade to a bigger tier ([P4]); a tier that is no bigger any more is review.
      const target = await tx.billingOffer.findUnique({
        where: { id: payment.offerId },
        select: { rank: true },
      });
      if (target === null || target.rank <= pack.offer.rank) return 'review';
      data = {
        offer: { connect: { id: payment.offerId } },
        storageBytes: BigInt(snapshot.collectionStorageBytes ?? '0'),
        guestLinks: Math.max(pack.guestLinks, snapshot.guestLinks ?? 0),
      };
    }
    await tx.collectionPack.update({ where: { id: pack.id }, data });
    await tx.collection.update({ where: { id: payment.collectionId }, data: SCHEDULE_CLEARED });
    return 'granted';
  }

  /**
   * A provider reversal ends what the payment granted ([Q4]): a pack's clocks end now (the
   * collection becomes read-only, its content kept per [P5]). An extension cannot be undone
   * exactly once others followed, so it is left to the operator (`review`).
   */
  async revoke(tx: Db, payment: Payment, now: Date): Promise<GrantResult> {
    if (payment.kind !== 'PACK' || payment.collectionId === null) return 'review';
    const pack = await tx.collectionPack.findUnique({
      where: { collectionId: payment.collectionId },
      select: { id: true, activatedAt: true },
    });
    if (pack === null) return 'review';
    const end = laterOf(now, pack.activatedAt);
    await tx.collectionPack.update({
      where: { id: pack.id },
      data: { windowEndsAt: end, retentionEndsAt: end },
    });
    return 'granted';
  }
}
