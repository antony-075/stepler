'use client';

// Design pass v4 (the owner's reference 2026-10-09, after v3's «Страница очень сильно насыщена
// текстом»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12). «Тариф і оплата» is one 48rem column under the page title with three
// tabs in `?tab=` (a history entry each): the shared segmented control, here spanning the column
// with equal segments and the active one on the soft accent with accent ink (scoped to this page;
// the collection page keeps the white thumb).
// - «Огляд» (default): the one alert that needs the owner now (`BillingAlert`), then «Ваш тариф»
//   (`PlanCard`), «Ліміти акаунта» and «Ваші пакети» (only with pack collections), stacked;
// - «Тарифи» (`?tab=plans`, also any `?pack=` / `?plan=` / `?collection=` without a tab): the
//   subscriptions and the packs as two titled groups with a rule between them, and the payment
//   note once at the end;
// - «Історія оплат» (`?tab=history`): the table alone.
// One spacing scale: 24px between cards, 32px between groups. Choosing a tab drops the purchase
// parameters, so a dialog opened by a link does not open again on the way back.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, ReceiptText, ShieldCheck, Tags, type LucideIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { fetchOffers, fetchSummary, offersKey, SUMMARY_KEY } from '@/api/billing';
import { AccountUsage } from '@/billing/account-usage';
import { PlanCard } from '@/billing/account-plan';
import { BillingAlert } from '@/billing/billing-alert';
import { type BillingTab, billingHref, billingTab } from '@/billing/billing-tab';
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

// The page's tabs: the segmented control across the column, the active segment on the soft
// accent (its thumb) with accent ink, 44px tall everywhere.
const TAB_LIST =
  'md:grid md:w-full md:auto-cols-[minmax(0,1fr)] [&>[data-slot=segment-thumb]]:bg-info-soft [&>[data-slot=segment-thumb]]:shadow-none';
const TAB = 'md:pointer-fine:min-h-11 text-[0.9375rem] data-[state=active]:text-link';

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
  const selectTab = (next: string) => {
    router.push(billingHref(billingTab(new URLSearchParams({ tab: next }))), { scroll: false });
  };

  return (
    <>
      <PageHeader size="compact" title={t('title')} />
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList variant="segmented" aria-label={t('tabs.label')} className={TAB_LIST}>
          {TABS.map(({ value, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className={TAB}>
              <Icon aria-hidden="true" className="max-sm:hidden" />
              <span className="min-w-0 truncate">{t(`tabs.${value}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="grid gap-6">
          {summary.isPending ? (
            <div className="grid gap-6" aria-hidden="true">
              <Skeleton className="h-72 w-full rounded-sheet" />
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
              <BillingAlert summary={summary.data} offers={offers.data} />
              <PlanCard summary={summary.data} offers={offers.data} />
              <AccountUsage usage={summary.data.usage} />
            </>
          )}
          <YourPacks collections={own.items} />
        </TabsContent>
        <TabsContent value="plans" className="grid gap-8">
          <SubscriptionsSection offers={offers} summary={summary.data} collectionTitles={titles} />
          <hr className="border-border" />
          <PacksSection />
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
