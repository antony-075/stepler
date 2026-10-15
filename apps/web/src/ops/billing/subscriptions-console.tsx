'use client';

// Design pass (billing M4, Task 21; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The subscriptions ledger, built like the payments list (filters in the URL,
// a dense table from `md`, cards below), with two differences:
// - a plan whose renewal LiqPay could not confirm carries «Потребує перевірки» (warning) and the
//   sentence «LiqPay не підтвердив продовження з …» — the operator's to-do; it never looks like an
//   error of the plan itself, because the owner keeps access meanwhile (ADR 0018, M4 deviation);
// - actions live in the row: «Звірити з LiqPay» (outline; its answer is shown in words under the
//   row and announced) and «Завершити зараз» (destructive, reason dialog). Grants show no action
//   here: they are revoked on «Безкоштовні тарифи».
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { OperatorSubscription, OperatorSubscriptionRefresh } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { useToast } from '@stepler/ui/components/toast';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  billingKeys,
  endSubscription,
  fetchSubscriptions,
  refreshSubscription,
  type SubscriptionFilters,
} from '../api/billing';
import { isOpsApiError } from '../api/client';
import type { OpsAction } from '../actions';
import { ReasonDialog } from '../reason-dialog';
import { KYIV, SUBSCRIPTION_BADGE, SUBSCRIPTION_STATUSES } from './billing-labels';
import { FlagBox, ListSkeleton } from './payments-console';
import { formatMinor } from './plan-format';

const ALL = 'all';
const TRUE = 'true';
const SOURCES = ['LIQPAY', 'COMPLIMENTARY'] as const;
const END: OpsAction = 'subscriptionEnd';

export function SubscriptionsConsole({ filters }: { filters: SubscriptionFilters }) {
  const t = useTranslations('ops');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [ending, setEnding] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: billingKeys.subscriptions(filters),
    queryFn: ({ pageParam, signal }) => fetchSubscriptions(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.values(filters).some((value) => value !== undefined);

  const confirmEnd = async (reason: string) => {
    try {
      await endSubscription(ending ?? '', reason);
    } catch (error) {
      throw new Error(
        isOpsApiError(error, 'PAYMENT_PROVIDER_UNAVAILABLE')
          ? t('subscriptions.refreshFailed')
          : isOpsApiError(error, 'NOT_FOUND')
            ? t('actions.gone')
            : t('actions.failed'),
        { cause: error },
      );
    }
    await queryClient.invalidateQueries({ queryKey: billingKeys.all });
    toast({ variant: 'success', title: t('actions.subscriptionEnd.done') });
  };

  return (
    <section aria-labelledby="ops-subscriptions-title" className="grid gap-5">
      <div className="grid max-w-3xl gap-1">
        <h1 id="ops-subscriptions-title" className="type-h1">
          {t('subscriptions.title')}
        </h1>
        <p className="text-muted-foreground">{t('subscriptions.intro')}</p>
      </div>
      <SubscriptionFilterBar key={JSON.stringify(filters)} filters={filters} />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <Alert
          variant="error"
          title={t('subscriptions.failed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <div className="rounded-sheet border bg-card">
          <EmptyState
            title={filtered ? t('subscriptions.emptyFiltered') : t('subscriptions.empty')}
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-2">
            {rows.map((row) => (
              <SubscriptionRow key={row.id} row={row} onEnd={() => setEnding(row.id)} />
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                aria-disabled={query.isFetchingNextPage || undefined}
                onClick={() => {
                  if (!query.isFetchingNextPage) void query.fetchNextPage();
                }}
              >
                {t('subscriptions.more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <ReasonDialog
        action={ending === null ? null : END}
        onOpenChange={(open) => {
          if (!open) setEnding(null);
        }}
        onConfirm={confirmEnd}
      />
    </section>
  );
}

function SubscriptionFilterBar({ filters }: { filters: SubscriptionFilters }) {
  const t = useTranslations('ops.subscriptions');
  const router = useRouter();
  const [status, setStatus] = useState<string>(filters.status ?? ALL);
  const [source, setSource] = useState<string>(filters.source ?? ALL);
  const [email, setEmail] = useState(filters.email ?? '');
  const [needsCheck, setNeedsCheck] = useState(filters.needsCheck === TRUE);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (status !== ALL) params.set('status', status);
    if (source !== ALL) params.set('source', source);
    if (email.trim() !== '') params.set('email', email.trim());
    if (needsCheck) params.set('needsCheck', TRUE);
    const text = params.toString();
    router.replace(`/ops/billing/subscriptions${text === '' ? '' : `?${text}`}`);
  };

  return (
    <form
      role="search"
      aria-label={t('filters.label')}
      noValidate
      onSubmit={apply}
      className="grid gap-3 rounded-sheet border bg-card p-4 md:grid-cols-[11rem_11rem_minmax(0,1fr)_auto] md:items-end"
    >
      <div className="grid gap-1.5">
        <Label id="ops-subscriptions-status">{t('filters.status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-labelledby="ops-subscriptions-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {SUBSCRIPTION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`statuses.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label id="ops-subscriptions-source">{t('filters.source')}</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger aria-labelledby="ops-subscriptions-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {SOURCES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`sources.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Field id="ops-subscriptions-email" label={t('filters.email')}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{t('filters.apply')}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.replace('/ops/billing/subscriptions')}
        >
          {t('filters.reset')}
        </Button>
      </div>
      <div className="md:col-span-4">
        <FlagBox id="ops-subscriptions-check" checked={needsCheck} onChange={setNeedsCheck}>
          {t('filters.needsCheck')}
        </FlagBox>
      </div>
    </form>
  );
}

function SubscriptionRow({ row, onEnd }: { row: OperatorSubscription; onEnd: () => void }) {
  const t = useTranslations('ops.subscriptions');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<string | null>(null);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: KYIV });
  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: KYIV });
  const refresh = useMutation({
    mutationFn: () => refreshSubscription(row.id),
    onSuccess: async (result) => {
      setAnswer(refreshText(t, result));
      await queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
    onError: () => setAnswer(t('refreshFailed')),
  });
  const paid = row.source === 'LIQPAY';
  const plan =
    row.price === null
      ? t('planFree', { title: row.offerTitle })
      : t('planLine', {
          title: row.offerTitle,
          price: formatMinor(format.number, row.price.amountMinor, row.price.currency),
          interval: t(`intervals.${row.interval ?? 'MONTH'}`),
        });
  const ended = row.status === 'EXPIRED';

  return (
    <li className="grid gap-3 rounded-sheet border bg-card p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="grid min-w-0 gap-1">
        <span className="font-medium [overflow-wrap:anywhere]">{row.email}</span>
        <span className="text-[0.9375rem] text-foreground-soft">{plan}</span>
      </div>
      <div className="grid gap-1.5 text-[0.875rem]">
        <span className="flex flex-wrap gap-1.5">
          <Badge variant={SUBSCRIPTION_BADGE[row.status]}>{t(`statuses.${row.status}`)}</Badge>
          {row.renewalUnverifiedSince === null ? null : (
            <Badge variant="warning">{t('needsCheck')}</Badge>
          )}
        </span>
        <span className="text-foreground-soft tabular-nums">
          {ended && row.endedAt !== null
            ? t('endedLine', { date: day(row.endedAt) })
            : t('periodLine', {
                date: row.currentPeriodEnd === null ? t('noEnd') : day(row.currentPeriodEnd),
              })}
        </span>
        {paid ? (
          <span className="text-muted-foreground tabular-nums">
            {t('checkedLine', {
              value:
                row.lastRefreshAt === null
                  ? t('never')
                  : row.lastRefreshOk
                    ? t('checkedOk', { date: date(row.lastRefreshAt) })
                    : t('checkedFailed', { date: date(row.lastRefreshAt) }),
            })}
          </span>
        ) : null}
        {row.renewalUnverifiedSince === null ? null : (
          <span className="text-warning">
            {t('needsCheckSince', { date: date(row.renewalUnverifiedSince) })}
          </span>
        )}
        {paid && row.providerUnsubscribedAt !== null ? (
          <span className="text-muted-foreground">{t('stopped')}</span>
        ) : null}
      </div>
      {paid ? (
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button
            variant="outline"
            aria-disabled={refresh.isPending || undefined}
            onClick={() => {
              if (!refresh.isPending) refresh.mutate();
            }}
          >
            {refresh.isPending ? t('refreshing') : t('refresh')}
          </Button>
          {ended ? null : (
            <Button variant="destructive" onClick={onEnd}>
              {t('end')}
            </Button>
          )}
        </div>
      ) : (
        <span />
      )}
      <p aria-live="polite" className="text-[0.9375rem] md:col-span-3 empty:hidden">
        {answer}
      </p>
    </li>
  );
}

type Translate = ReturnType<typeof useTranslations<'ops.subscriptions'>>;

function refreshText(t: Translate, result: OperatorSubscriptionRefresh): string {
  if (result.provider === null) return t('unknownOrder');
  if (result.renewal === 'NOT_EXPECTED') {
    return t('refreshResult.NOT_EXPECTED', { status: result.provider.status });
  }
  return t(`refreshResult.${result.renewal}`);
}
