'use client';

// Design pass (billing page v3, owner 2026-10-09; frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design). The packs group of «Тарифи»: the heading with an
// InfoTip for how a pack works (v2 had a whole panel for it), one caption (one-time, one
// collection), the pack cards in the auto-fit grid (17rem minimum, so two packs share a row from
// tablets). «Купити» opens the dialog; `?pack=` / `?collection=` open it with that choice made.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { InfoTip } from '@stepler/ui/components/info-tip';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { fetchOffers, offersKey } from '@/api/billing';
import { PACKS_SECTION_ID } from './billing-tab';
import { BuyPackDialog } from './buy-pack-dialog';
import { PackCard } from './offer-card';
import { packOffers } from './offers';

export function PacksSection() {
  const t = useTranslations('billing');
  const locale = useLocale();
  const params = useSearchParams();
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const packs = offers.data === undefined ? [] : packOffers(offers.data);
  const [chosen, setChosen] = useState<string | null>(params.get('pack'));
  const pack = packs.find((item) => item.offer.code === chosen) ?? null;

  return (
    <section
      id={PACKS_SECTION_ID}
      aria-labelledby="packs-title"
      className="grid scroll-mt-20 gap-4"
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5">
          <h2 id="packs-title" className="type-h2">
            {t('packs.title')}
          </h2>
          <InfoTip text={t('packs.how')} />
        </div>
        <p className="max-w-[70ch] text-sm text-pretty text-muted-foreground">{t('packs.intro')}</p>
      </div>
      {offers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-80 w-full rounded-sheet" />
          <Skeleton className="h-80 w-full rounded-sheet max-md:hidden" />
        </div>
      ) : offers.isError || packs.length === 0 ? (
        <Alert variant="info" role="status">
          {t('packs.unavailable')}
        </Alert>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4">
          {packs.map((item) => (
            <li key={item.offer.id}>
              <PackCard
                pack={item}
                action={
                  <Button className="w-full" onClick={() => setChosen(item.offer.code)}>
                    {t('pack.buy')}
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
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
