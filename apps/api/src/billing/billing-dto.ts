import type { EntitlementLimits, OperatorOffer, SubscriptionDto } from '@stepler/contracts';
import type { BillingOffer, BillingPrice, Subscription } from '../generated/prisma/client.js';

type OfferTitles = Pick<BillingOffer, 'titleUk' | 'titleEn'>;

/** Include in a subscription query for `toSubscriptionDto`'s pending change. */
export const WITH_PLAN_TITLES = {
  offer: { select: { titleUk: true, titleEn: true } },
  pendingOffer: { select: { titleUk: true, titleEn: true } },
  pendingPrice: true,
} as const;

type SubscriptionRow = Subscription & {
  offer: OfferTitles;
  pendingOffer?: OfferTitles | null;
  pendingPrice?: BillingPrice | null;
};

const bytes = (value: bigint | null): string | null => (value === null ? null : value.toString());

/** Explicit mapping; never a Prisma row as the contract (rule 06). */
export function toSubscriptionDto(row: SubscriptionRow, locale: 'uk' | 'en'): SubscriptionDto {
  const pendingOffer = row.pendingOffer ?? null;
  const pendingPrice = row.pendingPrice ?? null;
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
    pendingChange:
      pendingOffer === null || pendingPrice === null || row.pendingOfferId === null
        ? null
        : {
            kind: pendingPrice.interval === row.interval ? 'DOWNGRADE' : 'SWITCH',
            offerId: row.pendingOfferId,
            priceId: pendingPrice.id,
            offerTitle: locale === 'en' ? pendingOffer.titleEn : pendingOffer.titleUk,
            interval: pendingPrice.interval,
            price: { amountMinor: pendingPrice.amountMinor, currency: pendingPrice.currency },
            effectiveAt: row.currentPeriodEnd?.toISOString() ?? null,
            awaitingPayment: isSwitchAwaitingPayment(row),
          },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A monthly ↔ yearly switch whose old LiqPay subscription was stopped at the period end (owner
 * decision B14): the plan runs on (then in grace) until the new one is paid through a checkout.
 */
export function isSwitchAwaitingPayment(
  row: Pick<Subscription, 'interval' | 'providerUnsubscribedAt' | 'status'> & {
    pendingPrice?: Pick<BillingPrice, 'interval'> | null;
  },
): boolean {
  const pending = row.pendingPrice ?? null;
  return (
    pending !== null &&
    pending.interval !== row.interval &&
    row.providerUnsubscribedAt !== null &&
    (row.status === 'ACTIVE' || row.status === 'PAST_DUE')
  );
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
