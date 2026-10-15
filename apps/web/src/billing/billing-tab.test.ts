import { describe, expect, test } from 'vitest';
import { billingHref, billingTab, defaultOfferKind } from './billing-tab';

const tabOf = (search: string) => billingTab(new URLSearchParams(search));

describe('billingTab', () => {
  test('«Огляд» by default and for an unknown tab', () => {
    expect(tabOf('')).toBe('overview');
    expect(tabOf('tab=overview')).toBe('overview');
    expect(tabOf('tab=nope')).toBe('overview');
  });

  test('the named tabs', () => {
    expect(tabOf('tab=plans')).toBe('plans');
    expect(tabOf('tab=history')).toBe('history');
  });

  test('a purchase parameter opens «Тарифи», where its dialog lives', () => {
    expect(tabOf('pack=pack-start')).toBe('plans');
    expect(tabOf('plan=0190')).toBe('plans');
    expect(tabOf('collection=0190')).toBe('plans');
    expect(tabOf('pack=pack-start&collection=0190')).toBe('plans');
  });

  test('an explicit tab wins over a purchase parameter', () => {
    expect(tabOf('tab=history&pack=pack-start')).toBe('history');
    expect(tabOf('tab=overview&pack=pack-start')).toBe('overview');
  });
});

describe('billingHref', () => {
  test('«Огляд» is the bare path; the others carry ?tab=, and a hash goes last', () => {
    expect(billingHref('overview')).toBe('/app/billing');
    expect(billingHref('plans')).toBe('/app/billing?tab=plans');
    expect(billingHref('plans', 'packs')).toBe('/app/billing?tab=plans#packs');
    expect(billingHref('history')).toBe('/app/billing?tab=history');
  });
});

describe('defaultOfferKind', () => {
  const kind = (search: string, hash = '', pays = false) =>
    defaultOfferKind(new URLSearchParams(search), hash, pays);

  test('a link decides: a plan shows subscriptions, a pack or a collection shows packs', () => {
    expect(kind('plan=0190', '', false)).toBe('subscriptions');
    expect(kind('pack=pack-start', '', true)).toBe('packs');
    expect(kind('collection=0190', '', true)).toBe('packs');
    expect(kind('tab=plans', '#packs', true)).toBe('packs');
    expect(kind('tab=plans', '#subscriptions', false)).toBe('subscriptions');
  });

  test('otherwise a subscriber sees subscriptions, everyone else packs', () => {
    expect(kind('tab=plans', '', true)).toBe('subscriptions');
    expect(kind('tab=plans', '', false)).toBe('packs');
  });
});
