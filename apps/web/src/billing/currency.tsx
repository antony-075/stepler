'use client';

// The currency prices are SHOWN in (owner 2026-10-16: «Цены в долларах и евро — это просто для
// понимания, все равно оплата будет производиться в гривне и чек будет гривневый»). Every purchase
// is charged and receipted in hryvnias; $ and € are reference prices for orientation, and each
// card then says what is paid in hryvnias. Until the owner picks one it follows the interface
// language (Ukrainian → ₴, English → $); the pick is remembered in this browser (a convenience:
// storage may be blocked, then the language decides again).
import type { Currency, OfferList } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { useLocale, useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { CHARGE_CURRENCY, CURRENCIES, languageCurrency, offeredCurrencies } from './offers';

const STORAGE_KEY = 'stepler.billing.currency';
const CHANGE_EVENT = 'stepler:billing-currency';

function readStored(): Currency | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return CURRENCIES.find((currency) => currency === value) ?? null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The chosen currency (remembered, else the language's) and a setter that remembers it. */
export function useBillingCurrency(): [Currency, (currency: Currency) => void] {
  const locale = useLocale();
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const set = (currency: Currency) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      // Blocked storage: the choice lasts this page only.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [stored ?? languageCurrency(locale), set];
}

/**
 * The currency an offer list shows in: the chosen one when any reference price is listed in it,
 * else hryvnias.
 */
export function shownCurrency(list: OfferList | undefined, chosen: Currency): Currency {
  if (list === undefined) return chosen;
  return offeredCurrencies(list).includes(chosen) ? chosen : CHARGE_CURRENCY;
}

const SYMBOL: Record<Currency, string> = { UAH: '₴', USD: '$', EUR: '€' };

/**
 * «₴ / $ / €»: the shared pill track at the interval switch's height (40px), three equal 40px
 * segments, so choosing one never moves anything (owner's feedback 2026-10-16: it jumped). Hidden
 * when no reference prices are listed. That payment and the receipt are in hryvnias is
 * `CurrencyNote`, always in the section's foot, so the header row never changes either.
 */
export function CurrencySwitch({
  offers,
  value,
  onChange,
}: {
  offers: OfferList;
  value: Currency;
  onChange: (currency: Currency) => void;
}) {
  const t = useTranslations('billing.currency');
  const offered = offeredCurrencies(offers);
  if (offered.length < 2) return null;
  return (
    <ToggleGroup
      variant="pill"
      aria-label={t('label')}
      value={value}
      onValueChange={(next) => {
        if (next !== '') onChange(next as Currency);
      }}
    >
      {offered.map((currency) => (
        <ToggleGroupItem
          key={currency}
          value={currency}
          aria-label={t(`names.${currency}`)}
          className="w-10 px-0 tabular-nums"
        >
          <span aria-hidden="true">{SYMBOL[currency]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** «Ціни в $ і € — для орієнтиру. Оплата й чек — у гривнях.», where the switch is shown. */
export function CurrencyNote({ offers, className }: { offers: OfferList; className?: string }) {
  const t = useTranslations('billing.currency');
  if (offeredCurrencies(offers).length < 2) return null;
  return (
    <p data-slot="currency-note" className={className}>
      {t('reference')}
    </p>
  );
}
