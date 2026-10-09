'use client';

// Design pass v3 (owner 2026-10-09: «Страница очень сильно насыщена текстом… выглядит будто всё в
// одной куче»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12). «Тариф і оплата» is three tabs under the page title, the collection
// page's segmented control with the tab in `?tab=` (a history entry each):
// - «Огляд» (default): the one alert that needs the owner now (`BillingAlert`), then «Ваш тариф»
//   (`PlanCard`: the plan and the subscription in one card) beside the account's limits from
//   `lg`, then «Ваші пакети» only with pack collections;
// - «Тарифи» (`?tab=plans`, also any `?pack=` / `?plan=` / `?collection=` without a tab): the
//   subscriptions and the packs as two titled groups with a rule between them, and the payment
//   note once at the end;
// - «Історія оплат» (`?tab=history`): the table alone.
// One spacing scale: 32px between groups, 16px inside one. Choosing a tab drops the purchase
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

const PLAN_ROW = 'grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]';

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
        <TabsList variant="segmented" aria-label={t('tabs.label')}>
          {TABS.map(({ value, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden="true" className="max-sm:hidden" />
              <span className="min-w-0 truncate">{t(`tabs.${value}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="grid gap-8">
          {summary.isPending ? (
            <div className={PLAN_ROW} aria-hidden="true">
              <Skeleton className="h-60 w-full rounded-sheet" />
              <Skeleton className="h-60 w-full rounded-sheet" />
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
              <div className={PLAN_ROW}>
                <PlanCard summary={summary.data} offers={offers.data} />
                <AccountUsage usage={summary.data.usage} />
              </div>
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
