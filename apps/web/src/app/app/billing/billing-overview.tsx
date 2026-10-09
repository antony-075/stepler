'use client';

// Design pass v2 (owner 2026-10-08: «зроби сторінку Plan and billing красивою в тому ж стилі, що
// й решта застосунку»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0). «Тариф і оплата», top to bottom:
// - the page header like «Колекції» and «Акаунт»: the h1 and one line;
// - the plan and the account's limits side by side from `lg` (two panels of one height), stacked
//   below: `PlanCard` (name, state badge, the end date with the days left, «Купити пакет», what
//   happens after the end) and `AccountUsage` (two meters, the dashboard's bar);
// - «Ваші пакети», only with pack collections: each with its clocks and extensions;
// - «Купити пакет»: the pack cards in an auto-fit grid (17rem minimum, so two packs share a row
//   from tablets and never leave half of it empty), beside a quiet «Як працює пакет» note from
//   `xl`; «Купити» opens the dialog (`?pack=` / `?collection=` open it with that choice made);
// - «Історія оплат» like the dashboard's table.
// M3 (Task 18): the page reads `GET /billing/summary`. A live plan adds «Підписка» as a third
// panel of the plan row (from `xl`; two columns from `lg` with it wrapping under) and the period
// bar on the plan; «Підписка» with the plan cards comes before the packs. A monthly ↔ yearly
// switch waiting for its payment (B14) puts its banner above everything.
// Loading is a skeleton of the same panels; a failed read is an error Alert with retry.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Layers, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { BillingSummary, OfferList } from '@stepler/contracts';
import { fetchOffers, fetchSummary, offersKey, SUMMARY_KEY } from '@/api/billing';
import { AccountUsage } from '@/billing/account-usage';
import { BuyPackDialog } from '@/billing/buy-pack-dialog';
import { PackCard } from '@/billing/offer-card';
import { packOffers, subscriptionPlans } from '@/billing/offers';
import { useOwnCollections } from '@/billing/own-collections';
import { PaymentHistory } from '@/billing/payment-history';
import { PACKS_SECTION_ID, PlanCard } from '@/billing/plan-card';
import { SubscriptionCard } from '@/billing/subscription-card';
import { SubscriptionsSection } from '@/billing/subscriptions-section';
import { SwitchConfirmBanner } from '@/billing/switch-confirm-banner';
import { YourPacks } from '@/billing/your-packs';

export function BillingOverview() {
  const t = useTranslations('billing');
  const locale = useLocale();
  const summary = useQuery({ queryKey: SUMMARY_KEY, queryFn: fetchSummary });
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const own = useOwnCollections();
  const titles = useMemo(
    () => new Map(own.items.map((item) => [item.id, item.title])),
    [own.items],
  );

  return (
    <>
      <PageHeader size="compact" title={t('title')} description={t('intro')} />
      {summary.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-52 w-full rounded-sheet" />
          <Skeleton className="h-52 w-full rounded-sheet" />
        </div>
      ) : summary.isError ? (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void summary.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : (
        <>
          {summary.data.subscription === null ? null : (
            <SwitchConfirmBanner subscription={summary.data.subscription} offers={offers.data} />
          )}
          <PlanRow summary={summary.data} offers={offers.data} />
        </>
      )}
      <SubscriptionsSection offers={offers} summary={summary.data} collectionTitles={titles} />
      <YourPacks collections={own.items} />
      <PacksSection />
      <PaymentHistory collectionTitles={titles} />
    </>
  );
}

/** The plan, the account's limits and, with a live plan, «Підписка». */
function PlanRow({ summary, offers }: { summary: BillingSummary; offers: OfferList | undefined }) {
  const subscription = summary.subscription;
  const resumePlan =
    (subscription?.status !== 'CANCELED' && subscription?.status !== 'PAST_DUE') ||
    offers === undefined ||
    subscription.interval === null
      ? null
      : (subscriptionPlans(offers, subscription.interval === 'YEAR' ? 'YEAR' : 'MONTH').find(
          (plan) => plan.offer.id === subscription.offerId,
        ) ?? null);
  return (
    <div
      className={
        subscription === null
          ? 'grid gap-4 lg:grid-cols-2'
          : 'grid gap-4 lg:grid-cols-2 xl:grid-cols-3'
      }
    >
      <PlanCard
        access={summary.access}
        planTitle={subscription?.offerTitle ?? null}
        periodStart={
          subscription !== null &&
          (summary.access.reason === 'SUBSCRIPTION' || summary.access.reason === 'COMPLIMENTARY')
            ? subscription.currentPeriodStart
            : null
        }
      />
      <AccountUsage usage={summary.usage} />
      {subscription === null ? null : (
        <div className="lg:col-span-2 xl:col-span-1">
          <SubscriptionCard subscription={subscription} resumePlan={resumePlan} />
        </div>
      )}
    </div>
  );
}

function PacksSection() {
  const t = useTranslations('billing');
  const locale = useLocale();
  const params = useSearchParams();
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const packs = offers.data === undefined ? [] : packOffers(offers.data);
  const asked = params.get('pack');
  const [chosen, setChosen] = useState<string | null>(asked);
  const pack = packs.find((item) => item.offer.code === chosen) ?? null;

  return (
    <section
      id={PACKS_SECTION_ID}
      aria-labelledby="packs-title"
      className="grid scroll-mt-20 gap-3"
    >
      <div className="grid gap-1">
        <h2 id="packs-title" className="type-h2">
          {t('packs.title')}
        </h2>
        <p className="text-muted-foreground">{t('packs.intro')}</p>
      </div>
      {offers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          <Skeleton className="h-80 w-full rounded-sheet" />
          <Skeleton className="h-80 w-full rounded-sheet max-md:hidden" />
        </div>
      ) : offers.isError || packs.length === 0 ? (
        <Alert variant="info" role="status">
          {t('packs.unavailable')}
        </Alert>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
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
          <PacksNote />
        </div>
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

const NOTE_LINES: {
  key: 'packs.howOne' | 'pricing.extrasText' | 'pricing.paymentNote';
  icon: LucideIcon;
}[] = [
  { key: 'packs.howOne', icon: Layers },
  { key: 'pricing.extrasText', icon: CircleCheck },
  { key: 'pricing.paymentNote', icon: ShieldCheck },
];

/** How a pack works, in three lines: beside the cards from `xl`, under them below. */
function PacksNote() {
  const t = useTranslations('billing');
  return (
    <Panel className="bg-subtle shadow-none">
      <PanelContent className="grid gap-3">
        <h3 className="type-h3">{t('packs.howTitle')}</h3>
        <ul className="grid gap-2.5 text-sm text-foreground-soft">
          {NOTE_LINES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-2.5">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="text-pretty">{t(key)}</span>
            </li>
          ))}
        </ul>
      </PanelContent>
    </Panel>
  );
}
