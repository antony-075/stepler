'use client';

// Design pass (billing M4, Task 21; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The operator's money ledger, read like the moderation queue (§0.11):
// - filters live in the URL (`?status=&email=&needsReview=true&mismatch=true`) so a reload or a
//   shared link shows the same list; they apply on «Показати», not on every keystroke;
// - from `md` a dense table (56px rows, amounts right-aligned in tabular figures, one link per
//   row stretched over it); below `md` the same fields as stacked cards, never a sideways scroll;
// - the status badge is the row's one colour and always carries its word; «Перевірити» and
//   «Інша сума» are extra warning badges because those rows need the operator's hands;
// - «Показати ще» pages explicitly; skeleton rows while loading; empty and error states.
import { useInfiniteQuery } from '@tanstack/react-query';
import type { OperatorPayment } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Checkbox } from '@stepler/ui/components/checkbox';
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
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { billingKeys, fetchPayments, type PaymentFilters } from '../api/billing';
import { KYIV, PAYMENT_BADGE, PAYMENT_STATUSES } from './billing-labels';
import { formatMinor } from './plan-format';

const ALL = 'all';
const TRUE = 'true';

export function PaymentsConsole({ filters }: { filters: PaymentFilters }) {
  const t = useTranslations('ops.payments');
  const tOps = useTranslations('ops');
  const query = useInfiniteQuery({
    queryKey: billingKeys.payments(filters),
    queryFn: ({ pageParam, signal }) => fetchPayments(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.values(filters).some((value) => value !== undefined);

  return (
    <section aria-labelledby="ops-payments-title" className="grid gap-5">
      <div className="grid max-w-3xl gap-1">
        <h1 id="ops-payments-title" className="type-h1">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>
      <PaymentFilterBar key={JSON.stringify(filters)} filters={filters} />

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <Alert
          variant="error"
          title={t('failed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {tOps('retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <div className="rounded-sheet border bg-card">
          <EmptyState title={filtered ? t('emptyFiltered') : t('empty')} />
        </div>
      ) : (
        <>
          <PaymentTable rows={rows} />
          <PaymentCards rows={rows} />
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                aria-disabled={query.isFetchingNextPage || undefined}
                onClick={() => {
                  if (!query.isFetchingNextPage) void query.fetchNextPage();
                }}
              >
                {query.isFetchingNextPage ? t('loadingMore') : t('more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PaymentFilterBar({ filters }: { filters: PaymentFilters }) {
  const t = useTranslations('ops.payments');
  const router = useRouter();
  const [status, setStatus] = useState<string>(filters.status ?? ALL);
  const [email, setEmail] = useState(filters.email ?? '');
  const [review, setReview] = useState(filters.needsReview === TRUE);
  const [mismatch, setMismatch] = useState(filters.mismatch === TRUE);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (status !== ALL) params.set('status', status);
    if (email.trim() !== '') params.set('email', email.trim());
    if (review) params.set('needsReview', TRUE);
    if (mismatch) params.set('mismatch', TRUE);
    const text = params.toString();
    router.replace(`/ops/billing/payments${text === '' ? '' : `?${text}`}`);
  };

  return (
    <form
      role="search"
      aria-label={t('filters.label')}
      noValidate
      onSubmit={apply}
      className="grid gap-3 rounded-sheet border bg-card p-4 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end"
    >
      <div className="grid gap-1.5">
        <Label id="ops-payments-status">{t('filters.status')}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-labelledby="ops-payments-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {PAYMENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`statuses.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Field id="ops-payments-email" label={t('filters.email')}>
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
          onClick={() => router.replace('/ops/billing/payments')}
        >
          {t('filters.reset')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 md:col-span-3">
        <FlagBox id="ops-payments-review" checked={review} onChange={setReview}>
          {t('filters.needsReview')}
        </FlagBox>
        <FlagBox id="ops-payments-mismatch" checked={mismatch} onChange={setMismatch}>
          {t('filters.mismatch')}
        </FlagBox>
      </div>
    </form>
  );
}

export function FlagBox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 md:min-h-9">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="font-normal">
        {children}
      </Label>
    </div>
  );
}

function usePaymentText() {
  const t = useTranslations('ops.payments');
  const format = useFormatter();
  return {
    amount: (row: OperatorPayment) => formatMinor(format.number, row.amountMinor, row.currency),
    refunded: (row: OperatorPayment) =>
      row.refundedMinor === 0
        ? null
        : t('refunded', { amount: formatMinor(format.number, row.refundedMinor, row.currency) }),
    date: (iso: string) =>
      format.dateTime(new Date(iso), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: KYIV,
      }),
    what: (row: OperatorPayment) =>
      t('what', { kind: t(`kinds.${row.kind}`), title: row.offerTitle }),
  };
}

function StatusBadges({ row }: { row: OperatorPayment }) {
  const t = useTranslations('ops.payments');
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge variant={PAYMENT_BADGE[row.status]}>{t(`statuses.${row.status}`)}</Badge>
      {row.needsReview ? <Badge variant="warning">{t('flags.needsReview')}</Badge> : null}
      {row.mismatch ? <Badge variant="warning">{t('flags.mismatch')}</Badge> : null}
    </span>
  );
}

function PaymentTable({ rows }: { rows: OperatorPayment[] }) {
  const t = useTranslations('ops.payments');
  const text = usePaymentText();
  return (
    <div className="hidden overflow-hidden rounded-sheet border bg-card md:block">
      <table className="w-full table-fixed text-[0.875rem]">
        <caption className="sr-only">{t('title')}</caption>
        <thead className="border-b text-left text-[0.8125rem] text-muted-foreground">
          <tr>
            <th scope="col" className="w-[10.5rem] px-4 py-2.5 font-medium">
              {t('columns.date')}
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              {t('columns.account')}
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              {t('columns.what')}
            </th>
            <th scope="col" className="w-[11rem] px-4 py-2.5 text-right font-medium">
              {t('columns.amount')}
            </th>
            <th scope="col" className="w-[13rem] px-4 py-2.5 font-medium">
              {t('columns.status')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const refunded = text.refunded(row);
            return (
              <tr
                key={row.id}
                className="relative h-14 transition-colors hover:bg-hover-ghost has-[a:focus-visible]:bg-hover-ghost"
              >
                <td className="px-4 text-[0.8125rem] text-muted-foreground tabular-nums">
                  <time dateTime={row.createdAt}>{text.date(row.createdAt)}</time>
                </td>
                <td className="truncate px-4">
                  <Link
                    href={`/ops/billing/payments/${row.id}`}
                    className="outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {row.email}
                  </Link>
                </td>
                <td className="truncate px-4 text-foreground-soft">{text.what(row)}</td>
                <td className="px-4 text-right tabular-nums">
                  <span className="block font-medium">{text.amount(row)}</span>
                  {refunded === null ? null : (
                    <span className="block text-[0.8125rem] text-muted-foreground">{refunded}</span>
                  )}
                </td>
                <td className="px-4">
                  <StatusBadges row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentCards({ rows }: { rows: OperatorPayment[] }) {
  const text = usePaymentText();
  return (
    <ul className="grid gap-2 md:hidden">
      {rows.map((row) => {
        const refunded = text.refunded(row);
        return (
          <li key={row.id}>
            <Link
              href={`/ops/billing/payments/${row.id}`}
              className="grid min-h-11 gap-2 rounded-sheet border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{row.email}</span>
                <span className="shrink-0 text-right font-medium tabular-nums">
                  {text.amount(row)}
                </span>
              </span>
              <span className="text-[0.875rem] text-foreground-soft">{text.what(row)}</span>
              <StatusBadges row={row} />
              <span className="flex justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                <time dateTime={row.createdAt} className="tabular-nums">
                  {text.date(row.createdAt)}
                </time>
                {refunded === null ? null : <span>{refunded}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ListSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-sheet" />
      ))}
    </div>
  );
}
