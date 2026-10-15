import type { OfferDto, OfferList } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import {
  bestYearlyPercent,
  extensionOffer,
  formatMoney,
  packOffers,
  RETURN_CONFIRM_MS,
  retentionYears,
  returnView,
  storageUpgrade,
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
    expect(packOffers(list).map((p) => p.offer.id)).toEqual([start.id, event.id]);
    expect(extensionOffer(list, 'WINDOW')?.price).toEqual({ amountMinor: 19_900, currency: 'UAH' });
    expect(extensionOffer(list, 'RETENTION')).toBeNull();
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
    expect(yearlySaving(pro)).toEqual({
      percent: 17,
      saving: { amountMinor: 200_000, currency: 'UAH' },
      perMonth: { amountMinor: 83_333, currency: 'UAH' },
    });
    expect(yearlySaving(plan(100_000, 1_200_000))).toBeNull();
    expect(yearlySaving(offer({ kind: 'SUBSCRIPTION' }, null))).toBeNull();
    expect(bestYearlyPercent({ items: [plan(100_000, 1_080_000), pro, start] })).toBe(17);
    expect(bestYearlyPercent(list)).toBeNull();
  });

  test('money from minor units in the reader’s locale', () => {
    const uk = (value: number, options: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat('uk', options).format(value);
    expect(formatMoney(uk, { amountMinor: 49_900, currency: 'UAH' })).toMatch(/^499,00\s₴$/);
    expect(formatMoney(uk, { amountMinor: 5, currency: 'UAH' })).toMatch(/^0,05\s₴$/);
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
