import type { OperatorOffer } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { formValuesOf, limitFieldsOf, priceIntervalsOf, toOfferBody } from './offer-fields';

const start: OperatorOffer = {
  id: '0190f0a0-0000-7000-8000-000000000001',
  code: 'pack-start',
  kind: 'PACK',
  extension: null,
  titleUk: 'Старт',
  titleEn: 'Start',
  descriptionUk: null,
  descriptionEn: null,
  rank: 1,
  highlighted: false,
  ribbonUk: null,
  ribbonEn: null,
  active: true,
  limits: {
    activeCollections: null,
    storageBytes: null,
    collectionStorageBytes: String(10 * 1024 ** 3),
    guestLinks: 10,
    windowDays: 30,
    retentionDays: 365,
  },
  durationDays: null,
  rroItemId: null,
  prices: [],
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('the offer form', () => {
  test('round-trips a pack: GB in the form, bytes in the body, nulls for what a pack lacks', () => {
    const values = formValuesOf(start);
    expect(values).toMatchObject({
      collectionStorage: '10',
      windowDays: '30',
      activeCollections: '',
    });
    const body = toOfferBody({ ...values, collectionStorage: '20' }, limitFieldsOf('PACK', null));
    expect(body).toMatchObject({
      collectionStorageBytes: String(20 * 1024 ** 3),
      windowDays: 30,
      retentionDays: 365,
      activeCollections: null,
      storageBytes: null,
      durationDays: null,
      descriptionUk: null,
    });
  });

  test('a field the kind does not carry is sent as null even if typed', () => {
    const body = toOfferBody(
      { ...formValuesOf(start), activeCollections: '5' },
      limitFieldsOf('PACK', null),
    );
    expect(body.activeCollections).toBeNull();
  });

  test('what each kind is priced in', () => {
    expect(priceIntervalsOf('SUBSCRIPTION', null)).toEqual(['MONTH', 'YEAR']);
    expect(priceIntervalsOf('PACK', null)).toEqual(['ONE_TIME']);
    expect(priceIntervalsOf('PACK_EXTENSION', 'STORAGE')).toEqual([]);
    expect(priceIntervalsOf('TRIAL', null)).toEqual([]);
    expect(limitFieldsOf('PACK_EXTENSION', 'WINDOW')).toEqual(['windowDays']);
  });
});
