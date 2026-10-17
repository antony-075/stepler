'use client';

// Design pass v4 (the owner's reference 2026-10-09, after v3's «Страница очень сильно насыщена
// текстом»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12), then the owner's pick 2026-10-16, one to one with the artboards (C's
// Overview and History, A's Plans and PlansPhone). «Тариф і оплата» uses the full admin column
// (owner remark, M4 round 2026-10-15: «выглядит узко») under the page title, with three tabs in
// `?tab=` (a history entry each): text-only line tabs (15px, the chosen one 600 with a straight
// 2px accent line, a 1px rule across the column; on phones three equal columns at 14px, «Історія»
// short).
// - «Ваш тариф» (default): the one alert that needs the owner now (`BillingAlert`), then the plan
//   card (`PlanCard`), the limits as two cards under it (`AccountUsage`), then «Ваші пакети»
//   (only with pack collections);
// - «Тарифи» (`?tab=plans`, also any `?pack=` / `?plan=` / `?collection=` without a tab): «Що
//   вам підходить?» (`OfferKindChooser`, pack or subscription) and only that kind's offers, two
//   side by side from `sm`; each group's own closing line (cancelling for plans, the payment note
//   for packs);
// - «Історія платежів» (`?tab=history`): the list alone.
// One currency for the page (`useBillingCurrency`: remembered, else the interface language's);
// each «Тарифи» group shows «₴ / $ / €» in its heading row. Choosing a tab drops the purchase
// parameters, so a dialog opened by a link does not open again on the way back.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { fetchOffers, fetchSummary, offersKey, SUMMARY_KEY } from '@/api/billing';
import { AccountUsage } from '@/billing/account-usage';
import { PlanCard } from '@/billing/account-plan';
import { BillingAlert } from '@/billing/billing-alert';
import { useBillingCurrency } from '@/billing/currency';
import {
  type BillingTab,
  billingHref,
  billingTab,
  defaultOfferKind,
  type OfferKind,
} from '@/billing/billing-tab';
import { OfferKindChooser } from '@/billing/offer-kind-chooser';
import { useOwnCollections } from '@/billing/own-collections';
import { PacksSection } from '@/billing/packs-section';
import { PaymentHistory } from '@/billing/payment-history';
import { SubscriptionsSection } from '@/billing/subscriptions-section';
import { YourPacks } from '@/billing/your-packs';

const TABS: readonly BillingTab[] = ['overview', 'plans', 'history'];

/** The artboards' tabs: the shared line tabs with a straight accent line instead of the pencil. */
const TAB =
  'h-11 rounded-none px-4 font-normal max-sm:px-1 max-sm:text-sm data-[state=active]:font-semibold data-[state=active]:shadow-[inset_0_-2px_0_var(--primary)] [&>[data-slot=tabs-underline]]:hidden';

export function BillingOverview() {
  const t = useTranslations('billing');
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const tab = billingTab(params);
  const summary = useQuery({ queryKey: SUMMARY_KEY, queryFn: fetchSummary });
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const own = useOwnCollections();
  const titles = useMemo(
    () => new Map(own.items.map((item) => [item.id, item.title])),
    [own.items],
  );
  // «Тарифи» shows one kind of offer; until the owner picks, what the link or the account says.
  const [offerKind, setOfferKind] = useState<OfferKind | null>(null);
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const shownKind = offerKind ?? defaultOfferKind(params, hash);
  const [currency, setCurrency] = useBillingCurrency();
  const selectTab = (next: string) => {
    router.push(billingHref(billingTab(new URLSearchParams({ tab: next }))), { scroll: false });
  };

  return (
    <>
      <PageHeader size="compact" title={t('title')} />
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList aria-label={t('tabs.label')} className="gap-0 max-sm:grid max-sm:grid-cols-3">
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value} className={TAB}>
              {value === 'history' ? (
                <>
                  <span className="min-w-0 truncate sm:hidden">{t('tabs.historyShort')}</span>
                  <span className="min-w-0 truncate max-sm:hidden">{t('tabs.history')}</span>
                </>
              ) : (
                <span className="min-w-0 truncate">{t(`tabs.${value}`)}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="grid gap-5.5 sm:gap-8">
          {summary.isPending ? (
            <div className="grid gap-6" aria-hidden="true">
              <Skeleton className="h-72 w-full rounded-[1.25rem]" />
              <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-40 w-full rounded-[1.25rem]" />
                <Skeleton className="h-40 w-full rounded-[1.25rem] max-md:hidden" />
              </div>
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
              <BillingAlert summary={summary.data} offers={offers.data} />
              <PlanCard summary={summary.data} offers={offers.data} />
              <AccountUsage usage={summary.data.usage} />
            </>
          )}
          <YourPacks collections={own.items} />
        </TabsContent>
        <TabsContent value="plans" className="grid gap-5.5 sm:gap-8">
          <OfferKindChooser value={shownKind} onChange={setOfferKind} />
          {shownKind === 'subscriptions' ? (
            <SubscriptionsSection
              offers={offers}
              summary={summary.data}
              collectionTitles={titles}
              currency={currency}
              onCurrencyChange={setCurrency}
            />
          ) : (
            <>
              <PacksSection currency={currency} onCurrencyChange={setCurrency} />
              <p className="text-sm text-pretty text-muted-foreground">
                {t('pricing.paymentNote')}
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value="history">
          <PaymentHistory collectionTitles={titles} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readHash = () => window.location.hash;
const noHash = () => '';
