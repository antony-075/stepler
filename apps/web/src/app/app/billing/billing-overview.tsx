'use client';

// Design pass (billing M1, Task 7; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The placeholder «Тариф і оплата» page, honest about M1:
// - the h1 and one line, like «Акаунт»; then one panel: the access as a badge in words with its
//   reason and date, the two limits with their usage (the dashboard's numbers, mono), and what
//   «лише перегляд» means and how long content is kept, in plain words;
// - a quiet info line says card payments come next; no pay button exists until they do;
// - one column on phones, the same panel width as «Акаунт» on wide screens; loading is a
//   skeleton of the panel, a failure an error Alert with «Спробувати ще».
import type { Access } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { fetchUsage, USAGE_KEY } from '@/api/collections';
import { formatBytes } from '@/format/bytes';

const KYIV = 'Europe/Kyiv';

const STATE_BADGE = {
  ACTIVE: 'success',
  GRACE: 'warning',
  COLLECTING_CLOSED: 'warning',
  READ_ONLY: 'warning',
} as const;

export function BillingOverview() {
  const t = useTranslations('billing');
  const format = useFormatter();
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: fetchUsage });
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });

  return (
    <>
      <header className="grid gap-2">
        <h1 className="type-h1">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </header>
      {usage.isPending ? (
        <Skeleton className="h-64 w-full rounded-sheet" />
      ) : usage.isError ? (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void usage.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : (
        <Panel>
          <PanelHeader>
            <PanelTitle>{t('current')}</PanelTitle>
          </PanelHeader>
          <PanelContent className="grid gap-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant={STATE_BADGE[usage.data.access.state]}>
                {t(`states.${usage.data.access.state}`)}
              </Badge>
              <span className="text-foreground-soft">{reasonLine(t, usage.data.access, date)}</span>
            </p>
            <div className="grid gap-2">
              <h2 className="type-h3">{t('limits')}</h2>
              <ul className="grid gap-1 text-foreground-soft">
                <li>
                  {t('collectionsUsage', {
                    used: usage.data.activeCollections.used,
                    limit: usage.data.activeCollections.limit,
                  })}
                </li>
                <li>
                  {t('storageUsage', {
                    used: formatBytes(format.number, usage.data.storage.usedBytes),
                    limit: formatBytes(format.number, usage.data.storage.limitBytes),
                  })}
                </li>
              </ul>
            </div>
            <p className="max-w-[72ch] text-sm text-pretty text-muted-foreground">
              {t('readOnlyExplained')}
            </p>
            <Alert variant="info">{t('paymentsSoon')}</Alert>
          </PanelContent>
        </Panel>
      )}
    </>
  );
}

type Translate = ReturnType<typeof useTranslations<'billing'>>;

function reasonLine(t: Translate, access: Access, date: (iso: string) => string): string {
  const until = access.endsAt === null ? null : date(access.endsAt);
  switch (access.reason) {
    case 'TRIAL':
      return t('reasons.TRIAL', { date: until ?? '' });
    case 'SUBSCRIPTION':
      return until === null
        ? t('reasons.SUBSCRIPTION_OPEN')
        : t('reasons.SUBSCRIPTION', { date: until });
    case 'COMPLIMENTARY':
      return until === null
        ? t('reasons.COMPLIMENTARY_OPEN')
        : t('reasons.COMPLIMENTARY', { date: until });
    case 'SUBSCRIPTION_PAST_DUE':
      return t('reasons.SUBSCRIPTION_PAST_DUE', { date: until ?? '' });
    case 'TRIAL_ENDED':
    case 'SUBSCRIPTION_ENDED':
      return t(`reasons.${access.reason}`);
    default:
      return t('reasons.NONE');
  }
}
