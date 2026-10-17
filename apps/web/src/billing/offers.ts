import type { Currency, Money, OfferDto, OfferList, PaymentStatus } from '@stepler/contracts';

// Prices are charged in hryvnias, always (owner 2026-10-16: «Цены в долларах и евро — это просто
// для понимания, все равно оплата будет производиться в гривне и чек будет гривневый»). An offer
// may carry reference prices in USD and EUR (set in /ops, listed beside the UAH one); the page can
// show them for orientation (`display`), while every purchase uses the UAH price (`priceId`,
// `price`). An offer without a UAH price is not on sale; one without a reference price in the
// shown currency shows its UAH price.

/** The currency every purchase is charged and receipted in. */
export const CHARGE_CURRENCY: Currency = 'UAH';

type OfferInterval = OfferDto['prices'][number]['interval'];

/** An offer with the price it is bought at (UAH) and the amount shown for it. */
export interface PricedOffer {
  offer: OfferDto;
  /** The UAH price's id: what checkout is sent. */
  priceId: string;
  /** What is charged, in hryvnias. */
  price: Money;
  /** What the card shows: the reference price in the chosen currency, else `price`. */
  display: Money;
}

function priced(offer: OfferDto, interval: OfferInterval, display: Currency): PricedOffer | null {
  const charged = offer.prices.find(
    (p) => p.interval === interval && p.currency === CHARGE_CURRENCY,
  );
  if (charged === undefined) return null;
  const reference =
    display === CHARGE_CURRENCY
      ? charged
      : (offer.prices.find((p) => p.interval === interval && p.currency === display) ?? charged);
  return {
    offer,
    priceId: charged.id,
    price: { amountMinor: charged.amountMinor, currency: charged.currency },
    display: { amountMinor: reference.amountMinor, currency: reference.currency },
  };
}

/** The packs on sale, smallest tier first, shown in `display`. */
export function packOffers(list: OfferList, display: Currency = CHARGE_CURRENCY): PricedOffer[] {
  return list.items
    .filter((offer) => offer.kind === 'PACK')
    .sort((a, b) => a.rank - b.rank)
    .map((offer) => priced(offer, 'ONE_TIME', display))
    .filter((offer): offer is PricedOffer => offer !== null);
}

export type PlanInterval = 'MONTH' | 'YEAR';

/** A subscription plan with its price for one interval. */
export interface PricedPlan extends PricedOffer {
  interval: PlanInterval;
}

/** The subscription plans on sale for `interval`, smallest first (B5), shown in `display`. */
export function subscriptionPlans(
  list: OfferList,
  interval: PlanInterval,
  display: Currency = CHARGE_CURRENCY,
): PricedPlan[] {
  return list.items
    .filter((offer) => offer.kind === 'SUBSCRIPTION')
    .sort((a, b) => a.rank - b.rank)
    .flatMap((offer) => {
      const plan = priced(offer, interval, display);
      return plan === null ? [] : [{ ...plan, interval }];
    });
}

/** The intervals any plan is sold in (in hryvnias), monthly first. */
export function planIntervals(list: OfferList): PlanInterval[] {
  const sold = new Set(
    list.items
      .filter((offer) => offer.kind === 'SUBSCRIPTION')
      .flatMap((offer) =>
        offer.prices.filter((p) => p.currency === CHARGE_CURRENCY).map((p) => p.interval),
      ),
  );
  return (['MONTH', 'YEAR'] as const).filter((interval) => sold.has(interval));
}

/** What paying yearly saves against twelve monthly payments of the same plan. */
export interface YearlySaving {
  /** Whole percent, rounded to the nearest: 10 months' price for 12 → 17. */
  percent: number;
  saving: Money;
  /** The yearly price spread over 12 months, rounded down to whole minor units. */
  perMonth: Money;
}

/**
 * In `currency` when the plan has both its monthly and yearly reference prices in it, else in
 * hryvnias; `null` when it lacks either, or yearly saves nothing.
 */
export function yearlySaving(
  offer: OfferDto,
  currency: Currency = CHARGE_CURRENCY,
): YearlySaving | null {
  const pair = (cur: Currency) => ({
    month: offer.prices.find((p) => p.interval === 'MONTH' && p.currency === cur),
    year: offer.prices.find((p) => p.interval === 'YEAR' && p.currency === cur),
  });
  const own = pair(currency);
  const { month, year } =
    own.month !== undefined && own.year !== undefined ? own : pair(CHARGE_CURRENCY);
  if (month === undefined || year === undefined) return null;
  const full = month.amountMinor * 12;
  if (year.amountMinor >= full) return null;
  return {
    percent: Math.round(((full - year.amountMinor) / full) * 100),
    saving: { amountMinor: full - year.amountMinor, currency: year.currency },
    perMonth: { amountMinor: Math.floor(year.amountMinor / 12), currency: year.currency },
  };
}

/** The best yearly discount among the plans on sale, for the «Щороку» badge; `null` if none. */
export function bestYearlyPercent(
  list: OfferList,
  currency: Currency = CHARGE_CURRENCY,
): number | null {
  const percents = list.items
    .filter((offer) => offer.kind === 'SUBSCRIPTION')
    .flatMap((offer) => {
      const saving = yearlySaving(offer, currency);
      return saving === null ? [] : [saving.percent];
    });
  return percents.length === 0 ? null : Math.max(...percents);
}

/** «Продовжити збір» or «Продовжити зберігання», when on sale, shown in `display`. */
export function extensionOffer(
  list: OfferList,
  extension: 'WINDOW' | 'RETENTION',
  display: Currency = CHARGE_CURRENCY,
): PricedOffer | null {
  const offer = list.items.find(
    (item) => item.kind === 'PACK_EXTENSION' && item.extension === extension,
  );
  return offer === undefined ? null : priced(offer, 'ONE_TIME', display);
}

/**
 * The next bigger tier for a pack of `currentOfferId` and what moving to it costs: the difference
 * between the two tiers' current UAH prices ([P4]; the server computes the same and is
 * authoritative). `null` when there is no bigger tier on sale or the current tier is unknown.
 */
export function storageUpgrade(
  list: OfferList,
  currentOfferId: string,
): { target: PricedOffer; difference: Money } | null {
  const packs = packOffers(list);
  const current = packs.find((p) => p.offer.id === currentOfferId);
  if (current === undefined) return null;
  const target = packs.find((p) => p.offer.rank > current.offer.rank);
  if (target === undefined) return null;
  const amountMinor = target.price.amountMinor - current.price.amountMinor;
  if (amountMinor <= 0) return null;
  return { target, difference: { amountMinor, currency: CHARGE_CURRENCY } };
}

interface CurrencyOptions {
  style: 'currency';
  currency: string;
  currencyDisplay: 'narrowSymbol';
  minimumFractionDigits: number;
  maximumFractionDigits: number;
}

/** The interface language's own currency: Ukrainian → ₴, any other → $. */
export function languageCurrency(locale: string): Currency {
  return locale.startsWith('uk') ? 'UAH' : 'USD';
}

/** The currencies on sale, in the switcher's order. */
export const CURRENCIES: readonly Currency[] = ['UAH', 'USD', 'EUR'];

/** The currencies prices can be shown in: hryvnias, and any with a reference price. */
export function offeredCurrencies(list: OfferList): Currency[] {
  const listed = new Set(list.items.flatMap((offer) => offer.prices.map((p) => p.currency)));
  return CURRENCIES.filter((currency) => currency === CHARGE_CURRENCY || listed.has(currency));
}
type NumberFormatter = (value: number, options: CurrencyOptions) => string;

/**
 * `100000 UAH → «1 000 ₴»`, `2550 USD → «$25.50»` in the reader's locale; minor units in, display
 * only. Whole amounts drop «,00» (owner 2026-10-16: prices are round); others keep two decimals.
 */
export function formatMoney(format: NumberFormatter, money: Money): string {
  const digits = money.amountMinor % 100 === 0 ? 0 : 2;
  return format(money.amountMinor / 100, {
    style: 'currency',
    currency: money.currency,
    // «₴» everywhere: browsers and Node differ on «грн» vs «₴» for `symbol` in Ukrainian.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
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
