import type { OfferDto, OfferList } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import {
  bestYearlyPercent,
  extensionOffer,
  formatMoney,
  languageCurrency,
  offeredCurrencies,
  packOffers,
  RETURN_CONFIRM_MS,
  retentionYears,
  returnView,
  storageUpgrade,
  subscriptionPlans,
  yearlySaving,
} from './offers';

const limits = {
  activeCollections: null,
  storageBytes: null,
  collectionStorageBytes: '10737418240',
  guestLinks: 10,
  windowDays: 30,
  retentionDays: 365,
};
let n = 0;
const offer = (over: Partial<OfferDto>, amountMinor: number | null): OfferDto => {
  n += 1;
  const id = `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    code: `o${n}`,
    kind: 'PACK',
    extension: null,
    title: `T${n}`,
    description: null,
    limits,
    rank: n,
    highlighted: false,
    prices:
      amountMinor === null
        ? []
        : [{ id: `${id.slice(0, -1)}f`, interval: 'ONE_TIME', amountMinor, currency: 'UAH' }],
    ...over,
  };
};

const start = offer({ rank: 1 }, 49_900);
const event = offer({ rank: 2 }, 99_900);
const window = offer({ kind: 'PACK_EXTENSION', extension: 'WINDOW', rank: 10 }, 19_900);
const list: OfferList = { items: [window, event, start] };

describe('offers', () => {
  test('packs by tier, extensions by kind', () => {
    expect(packOffers(list, 'UAH').map((p) => p.offer.id)).toEqual([start.id, event.id]);
    expect(extensionOffer(list, 'WINDOW', 'UAH')?.price).toEqual({
      amountMinor: 19_900,
      currency: 'UAH',
    });
    expect(extensionOffer(list, 'RETENTION', 'UAH')).toBeNull();
    // No dollar reference prices here: the cards show hryvnias, the purchase is in hryvnias.
    expect(packOffers(list, 'USD').map((p) => p.display)).toEqual([
      { amountMinor: 49_900, currency: 'UAH' },
      { amountMinor: 99_900, currency: 'UAH' },
    ]);
    expect(extensionOffer(list, 'WINDOW', 'USD')?.priceId).toBe(window.prices[0]?.id);
  });

  test('a storage upgrade costs the difference to the next tier', () => {
    expect(storageUpgrade(list, start.id)).toMatchObject({
      target: { offer: { id: event.id } },
      difference: { amountMinor: 50_000, currency: 'UAH' },
    });
    expect(storageUpgrade(list, event.id)).toBeNull();
    expect(storageUpgrade(list, 'unknown')).toBeNull();
  });

  test('yearly pricing: ten months for twelve is 17% off, the best plan names the badge', () => {
    const plan = (month: number, year: number) =>
      offer(
        {
          kind: 'SUBSCRIPTION',
          prices: [
            { id: `m${month}`, interval: 'MONTH', amountMinor: month, currency: 'UAH' },
            { id: `y${year}`, interval: 'YEAR', amountMinor: year, currency: 'UAH' },
          ],
        },
        null,
      );
    const pro = plan(100_000, 1_000_000);
    expect(yearlySaving(pro, 'UAH')).toEqual({
      percent: 17,
      saving: { amountMinor: 200_000, currency: 'UAH' },
      perMonth: { amountMinor: 83_333, currency: 'UAH' },
    });
    expect(yearlySaving(plan(100_000, 1_200_000), 'UAH')).toBeNull();
    expect(yearlySaving(offer({ kind: 'SUBSCRIPTION' }, null), 'UAH')).toBeNull();
    // No dollar prices on this plan: the saving is shown in hryvnias.
    expect(yearlySaving(pro, 'USD')?.saving.currency).toBe('UAH');
    expect(bestYearlyPercent({ items: [plan(100_000, 1_080_000), pro, start] }, 'UAH')).toBe(17);
    expect(bestYearlyPercent(list, 'UAH')).toBeNull();
  });

  test('$ and € are reference prices: shown on the card, the purchase stays in hryvnias', () => {
    const multi = offer(
      {
        kind: 'SUBSCRIPTION',
        prices: [
          { id: 'mu', interval: 'MONTH', amountMinor: 100_000, currency: 'UAH' },
          { id: 'yu', interval: 'YEAR', amountMinor: 1_000_000, currency: 'UAH' },
          { id: 'md', interval: 'MONTH', amountMinor: 2_500, currency: 'USD' },
          { id: 'yd', interval: 'YEAR', amountMinor: 25_000, currency: 'USD' },
        ],
      },
      null,
    );
    const plans: OfferList = { items: [multi] };
    const [usd] = subscriptionPlans(plans, 'MONTH', 'USD');
    expect(usd?.priceId).toBe('mu');
    expect(usd?.price).toEqual({ amountMinor: 100_000, currency: 'UAH' });
    expect(usd?.display).toEqual({ amountMinor: 2_500, currency: 'USD' });
    // No euro reference price: the card shows hryvnias.
    expect(subscriptionPlans(plans, 'MONTH', 'EUR')[0]?.display.currency).toBe('UAH');
    expect(yearlySaving(multi, 'USD')?.saving).toEqual({ amountMinor: 5_000, currency: 'USD' });
    expect(yearlySaving(multi, 'EUR')?.saving.currency).toBe('UAH');
    expect(offeredCurrencies(plans)).toEqual(['UAH', 'USD']);
    expect(languageCurrency('uk')).toBe('UAH');
    expect(languageCurrency('en')).toBe('USD');
    // An offer with no hryvnia price is not on sale, whatever else it lists.
    const dollarsOnly = offer(
      {
        kind: 'SUBSCRIPTION',
        prices: [{ id: 'x', interval: 'MONTH', amountMinor: 2_500, currency: 'USD' }],
      },
      null,
    );
    expect(subscriptionPlans({ items: [dollarsOnly] }, 'MONTH', 'USD')).toEqual([]);
  });

  test('money from minor units in the reader’s locale', () => {
    const uk = (value: number, options: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat('uk', options).format(value);
    const en = (value: number, options: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat('en', options).format(value);
    // Whole amounts drop «,00»; others keep two decimals.
    expect(formatMoney(uk, { amountMinor: 100_000, currency: 'UAH' })).toMatch(/^1\s000\s₴$/);
    expect(formatMoney(uk, { amountMinor: 49_950, currency: 'UAH' })).toMatch(/^499,50\s₴$/);
    expect(formatMoney(uk, { amountMinor: 5, currency: 'UAH' })).toMatch(/^0,05\s₴$/);
    expect(formatMoney(en, { amountMinor: 2_500, currency: 'USD' })).toBe('$25');
    expect(formatMoney(en, { amountMinor: 2_200, currency: 'EUR' })).toBe('€22');
    expect(formatMoney(uk, { amountMinor: 2_500, currency: 'USD' })).toMatch(/^25\s\$$/);
  });

  test('retention in years when whole', () => {
    expect(retentionYears(365)).toBe(1);
    expect(retentionYears(730)).toBe(2);
    expect(retentionYears(100)).toBeNull();
  });
});

describe('returnView', () => {
  const base = { notFound: false, failed: false, elapsedMs: 0 };
  test('from the API status only', () => {
    expect(returnView({ ...base, status: undefined })).toBe('loading');
    expect(returnView({ ...base, status: undefined, failed: true })).toBe('error');
    expect(returnView({ ...base, status: undefined, notFound: true })).toBe('notFound');
    expect(returnView({ ...base, status: 'PENDING' })).toBe('pending');
    expect(returnView({ ...base, status: 'PENDING', elapsedMs: RETURN_CONFIRM_MS - 1 })).toBe(
      'pending',
    );
    expect(returnView({ ...base, status: 'PENDING', elapsedMs: RETURN_CONFIRM_MS })).toBe(
      'unconfirmed',
    );
    expect(returnView({ ...base, status: 'SUCCEEDED' })).toBe('succeeded');
    expect(returnView({ ...base, status: 'PARTIALLY_REFUNDED' })).toBe('succeeded');
    expect(returnView({ ...base, status: 'FAILED' })).toBe('failed');
    expect(returnView({ ...base, status: 'EXPIRED' })).toBe('expired');
  });
});
