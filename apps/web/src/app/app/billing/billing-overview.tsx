'use client';

// Design pass v4 (the owner's reference 2026-10-09, after v3's «Страница очень сильно насыщена
// текстом»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12). «Тариф і оплата» uses the full admin column (owner remark, M4 round
// 2026-10-15: «выглядит узко») under the page title, with three tabs in `?tab=` (a history entry each): the shared segmented control, here spanning the column
// with equal segments and the active one on the soft accent with accent ink (scoped to this page;
// the collection page keeps the white thumb).
// - «Огляд» (default): the one alert that needs the owner now (`BillingAlert`), then «Ваш тариф»
//   (`PlanCard`) and «Ліміти акаунта» side by side from `xl` (stacked below), then «Ваші пакети»
//   (only with pack collections);
// - «Тарифи» (`?tab=plans`, also any `?pack=` / `?plan=` / `?collection=` without a tab): «Що
//   вам підходить?» (`OfferKindChooser`, pack or subscription) and only that kind's offers, in
//   two columns from `sm`, three from `xl`; the payment note once at the end;
// - «Історія оплат» (`?tab=history`): the table alone.
// One spacing scale: 24px between cards, 32px between groups. Choosing a tab drops the purchase
// parameters, so a dialog opened by a link does not open again on the way back.
// Owner's pick 2026-10-16: «Ваш тариф» and «Історія платежів» from direction C, «Тарифи» from A,
// one look across them (`billing/surfaces.ts`): the line tabs (text and the accent underline,
// 48px), the plan card full width with the limits as two cards under it, the offers as A's cards.
// One currency for the page (`useBillingCurrency`: remembered, else the interface language's);
// each «Тарифи» group shows «₴ / $ / €» beside its heading.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, ReceiptText, ShieldCheck, Tags, type LucideIcon } from 'lucide-react';
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

const TABS: { value: BillingTab; icon: LucideIcon }[] = [
  { value: 'overview', icon: LayoutGrid },
  { value: 'plans', icon: Tags },
  { value: 'history', icon: ReceiptText },
];

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
  const paysSubscription = summary.data?.subscription?.source === 'LIQPAY';
  const shownKind = offerKind ?? defaultOfferKind(params, hash, paysSubscription);
  const [currency, setCurrency] = useBillingCurrency();
  const selectTab = (next: string) => {
    router.push(billingHref(billingTab(new URLSearchParams({ tab: next }))), { scroll: false });
  };

  return (
    <>
      <PageHeader size="compact" title={t('title')} />
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList aria-label={t('tabs.label')}>
          {TABS.map(({ value, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden="true" className="max-sm:hidden" />
              <span className="min-w-0 truncate">{t(`tabs.${value}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="grid gap-8">
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
        <TabsContent value="plans" className="grid gap-8">
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
            <PacksSection currency={currency} onCurrencyChange={setCurrency} />
          )}
          <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('pricing.paymentNote')}
          </p>
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
