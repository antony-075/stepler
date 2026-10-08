import type { Money, OfferDto, OfferList, PaymentStatus } from '@stepler/contracts';

/** An offer with its one-time price in the currency we sell now (UAH, [B2]). */
export interface PricedOffer {
  offer: OfferDto;
  priceId: string;
  price: Money;
}

function oneTime(offer: OfferDto): PricedOffer | null {
  const price = offer.prices.find((p) => p.interval === 'ONE_TIME');
  if (price === undefined) return null;
  return {
    offer,
    priceId: price.id,
    price: { amountMinor: price.amountMinor, currency: price.currency },
  };
}

/** The packs on sale, smallest tier first. */
export function packOffers(list: OfferList): PricedOffer[] {
  return list.items
    .filter((offer) => offer.kind === 'PACK')
    .sort((a, b) => a.rank - b.rank)
    .map(oneTime)
    .filter((offer): offer is PricedOffer => offer !== null);
}

/** «Продовжити збір» or «Продовжити зберігання», when on sale. */
export function extensionOffer(
  list: OfferList,
  extension: 'WINDOW' | 'RETENTION',
): PricedOffer | null {
  const offer = list.items.find(
    (item) => item.kind === 'PACK_EXTENSION' && item.extension === extension,
  );
  return offer === undefined ? null : oneTime(offer);
}

/**
 * The next bigger tier for a pack of `currentOfferId` and what moving to it costs: the difference
 * between the two tiers' current prices ([P4]; the server computes the same and is authoritative).
 * `null` when there is no bigger tier on sale or the current tier's price is unknown.
 */
export function storageUpgrade(
  list: OfferList,
  currentOfferId: string,
): { target: PricedOffer; difference: Money } | null {
  const packs = packOffers(list);
  const current = packs.find((p) => p.offer.id === currentOfferId);
  if (current === undefined) return null;
  const target = packs.find(
    (p) => p.offer.rank > current.offer.rank && p.price.currency === current.price.currency,
  );
  if (target === undefined) return null;
  const amountMinor = target.price.amountMinor - current.price.amountMinor;
  if (amountMinor <= 0) return null;
  return { target, difference: { amountMinor, currency: current.price.currency } };
}

interface CurrencyOptions {
  style: 'currency';
  currency: string;
  currencyDisplay: 'narrowSymbol';
  minimumFractionDigits: number;
  maximumFractionDigits: number;
}
type NumberFormatter = (value: number, options: CurrencyOptions) => string;

/** `49900 UAH → «499,00 ₴»` in the reader's locale; minor units in, display only. */
export function formatMoney(format: NumberFormatter, money: Money): string {
  return format(money.amountMinor / 100, {
    style: 'currency',
    currency: money.currency,
    // «₴» everywhere: browsers and Node differ on «грн» vs «₴» for `symbol` in Ukrainian.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole years when the days are a multiple of 365, for «зберігання 1 рік». */
export function retentionYears(days: number): number | null {
  return days % 365 === 0 ? days / 365 : null;
}

/** What the return page shows (plan Task 14); never from its own URL, only from the API. */
export type ReturnView =
  'loading' | 'pending' | 'unconfirmed' | 'succeeded' | 'failed' | 'expired' | 'notFound' | 'error';

/**
 * The return page polls every 3 s for up to 2 minutes. After 20 s without a final answer it stops
 * saying «очікуємо» and offers to pay again or check again (a declined card at LiqPay sends no
 * callback and leaves the order open), while it keeps polling in the background.
 */
export const RETURN_POLL_MS = 3_000;
export const RETURN_CONFIRM_MS = 20_000;
export const RETURN_POLL_LIMIT_MS = 120_000;

export function returnView(input: {
  status: PaymentStatus | undefined;
  notFound: boolean;
  failed: boolean;
  elapsedMs: number;
}): ReturnView {
  if (input.notFound) return 'notFound';
  switch (input.status) {
    case undefined:
      return input.failed ? 'error' : 'loading';
    case 'PENDING':
      return input.elapsedMs >= RETURN_CONFIRM_MS ? 'unconfirmed' : 'pending';
    case 'FAILED':
      return 'failed';
    case 'EXPIRED':
      return 'expired';
    default:
      // Paid; a later refund or reversal is shown in the payment history.
      return 'succeeded';
  }
}
