import type { EntitlementLimits, OperatorOffer, SubscriptionDto } from '@stepler/contracts';
import type { BillingOffer, Subscription } from '../generated/prisma/client.js';

type OfferTitles = Pick<BillingOffer, 'titleUk' | 'titleEn'>;

const bytes = (value: bigint | null): string | null => (value === null ? null : value.toString());

/** Explicit mapping; never a Prisma row as the contract (rule 06). */
export function toSubscriptionDto(
  row: Subscription & { offer: OfferTitles },
  locale: 'uk' | 'en',
): SubscriptionDto {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    offerId: row.offerId,
    offerTitle: locale === 'en' ? row.offer.titleEn : row.offer.titleUk,
    interval: row.interval,
    price:
      row.amountMinor === null || row.currency === null
        ? null
        : { amountMinor: row.amountMinor, currency: row.currency },
    limits: {
      activeCollections: row.activeCollections,
      storageBytes: row.storageBytes.toString(),
      collectionStorageBytes: row.collectionStorageBytes.toString(),
      guestLinks: row.guestLinks,
      windowDays: null,
      retentionDays: null,
    },
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    createdAt: row.createdAt.toISOString(),
  };
}

export function offerLimits(row: BillingOffer): EntitlementLimits {
  return {
    activeCollections: row.activeCollections,
    storageBytes: bytes(row.storageBytes),
    collectionStorageBytes: bytes(row.collectionStorageBytes),
    guestLinks: row.guestLinks,
    windowDays: row.windowDays,
    retentionDays: row.retentionDays,
  };
}

export function toOperatorOffer(row: BillingOffer): OperatorOffer {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    extension: row.extension,
    titleUk: row.titleUk,
    titleEn: row.titleEn,
    rank: row.rank,
    active: row.active,
    limits: offerLimits(row),
  };
}
