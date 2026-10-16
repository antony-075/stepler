'use client';

// Design pass (billing page v3, owner 2026-10-09; the owner's pick 2026-10-16, direction A, with
// prices per currency; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design).
// The packs group of «Тарифи»: the heading with an InfoTip for how a pack works, one caption
// (one-time, one collection) and «₴ / $ / €» on the same row, the pack cards (tickets: the price
// over a perforation, the three facts as tiles under it) two side by side from `sm`, three from
// `xl`. Under them «Уже маєте пакет?»: the two extensions with their prices as quiet rows, bought
// from the collection's own page. «Купити» opens the dialog; `?pack=` / `?collection=` open it
// with that choice made.
import type { Currency } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { InfoTip } from '@stepler/ui/components/info-tip';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { cn } from '@stepler/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { fetchOffers, offersKey } from '@/api/billing';
import { PACKS_SECTION_ID } from './billing-tab';
import { BuyPackDialog } from './buy-pack-dialog';
import { CurrencySwitch, shownCurrency } from './currency';
import { offerButtonClass, PackCard } from './offer-card';
import { extensionOffer, formatMoney, packOffers } from './offers';
import { CARD, SECTION_NOTE, SECTION_TITLE } from './surfaces';

export function PacksSection({
  currency: chosenCurrency,
  onCurrencyChange,
}: {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}) {
  const t = useTranslations('billing');
  const locale = useLocale();
  const format = useFormatter();
  const params = useSearchParams();
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const currency = shownCurrency(offers.data, chosenCurrency);
  const list = offers.data;
  const packs = list === undefined ? [] : packOffers(list, currency);
  const extensions =
    list === undefined
      ? []
      : (['WINDOW', 'RETENTION'] as const).flatMap((kind) => {
          const offer = extensionOffer(list, kind, currency);
          return offer === null ? [] : [{ kind, offer }];
        });
  const [chosen, setChosen] = useState<string | null>(params.get('pack'));
  const pack = packs.find((item) => item.offer.code === chosen) ?? null;

  return (
    <section
      id={PACKS_SECTION_ID}
      aria-labelledby="packs-title"
      className="grid scroll-mt-20 gap-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-1.5">
            <h2 id="packs-title" className={SECTION_TITLE}>
              {t('packs.title')}
            </h2>
            <InfoTip text={t('packs.how')} />
          </div>
          <p className={SECTION_NOTE}>{t('packs.intro')}</p>
        </div>
        {list === undefined ? null : (
          <CurrencySwitch offers={list} value={currency} onChange={onCurrencyChange} />
        )}
      </div>
      {offers.isPending ? (
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-96 w-full rounded-[1.25rem]" />
          <Skeleton className="h-96 w-full rounded-[1.25rem] max-md:hidden" />
        </div>
      ) : offers.isError || packs.length === 0 ? (
        <Alert variant="info" role="status">
          {t('packs.unavailable')}
        </Alert>
      ) : (
        <ul className="grid gap-6 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {packs.map((item) => (
            <li key={item.offer.id}>
              <PackCard
                pack={item}
                action={
                  <Button
                    className={offerButtonClass(item.offer.highlighted)}
                    onClick={() => setChosen(item.offer.code)}
                  >
                    {t('pack.buy')}
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {extensions.length === 0 ? null : (
        <section aria-labelledby="extensions-title" className="grid gap-3">
          <div className="grid gap-1">
            <h3 id="extensions-title" className="text-base font-semibold">
              {t('packs.extensionsTitle')}
            </h3>
            <p className={SECTION_NOTE}>{t('packs.extensionsNote')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {extensions.map(({ kind, offer }) => (
              <li key={kind} className={cn(CARD, 'flex items-center gap-4 px-5 py-4 shadow-none')}>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{offer.offer.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {t(`packs.extension.${kind}`)}
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {offer.display.currency === offer.price.currency
                    ? formatMoney(format.number, offer.price)
                    : t('plans.approxPrice', { price: formatMoney(format.number, offer.display) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pack === null ? null : (
        <BuyPackDialog
          key={pack.offer.id}
          pack={pack}
          open
          onOpenChange={(open) => {
            if (!open) setChosen(null);
          }}
          initialCollectionId={params.get('collection') ?? undefined}
        />
      )}
    </section>
  );
}
