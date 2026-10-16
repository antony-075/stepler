'use client';

// Owner's pick 2026-10-16: «Історія платежів» exactly as direction C's artboard (History.dc.html):
// - a row of chips «Усі · 4 / Підписка · 2 / Пакети · 2» (a radio group; the counts and the
//   filter come from the API, `GET /billing/payments/totals` and `?group=`) and «За 2026 рік:
//   4 500 ₴» on the right (what was paid this calendar year, less refunds);
// - one bordered list (radius 20, no shadow), at most 960px wide so a row reads as one line;
//   each dense row: the date (dd.mm.yyyy, Kyiv, 110px, muted), a 36px tile for what was bought
//   (↻ a plan, a ticket for a pack, a clock for more days), the title with one muted detail line,
//   then the state as a small pill and the amount, together in a fixed-width group on the right.
//   A payment that failed or was reversed is the amber row with what that means in amber;
// - «За 2026 рік» only when something was paid this year (no «0 ₴»);
// - «Показати ще» centred under the list (pages of 50).
// Owner's feedback 2026-10-16 («уродливая таблица, куча пустого места»). Below `md` a row is two
// lines: the title and the amount, then the date with the detail and the pill (the tile from `sm`).
import type { PaymentDto, PaymentGroup, PaymentKind, PaymentStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Clock, type LucideIcon, ReceiptText, RefreshCw, Ticket } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type KeyboardEvent, useRef, useState } from 'react';
import { fetchPaymentTotals, listPayments, PAYMENT_TOTALS_KEY, paymentsKey } from '@/api/billing';
import { formatMoney } from './offers';

/** The chip and message key of «Усі». */
const ALL = 'all';
const KYIV = 'Europe/Kyiv';
const SEPARATOR = ' · ';

/** A payment state's tone (the ops console and the return page share it). */
export const PAYMENT_BADGE: Record<PaymentStatus, BadgeVariant> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REVERSED: 'warning',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};

/** The state's pill in the list: amber for the money that did not arrive or went back. */
const ROW_BADGE: Record<PaymentStatus, BadgeVariant> = {
  ...PAYMENT_BADGE,
  FAILED: 'warning',
};

/** What was bought, as the row's 36px tile: a plan renews, a pack is one event, more days. */
const KIND_ICON: Record<PaymentKind, LucideIcon> = {
  SUBSCRIPTION: RefreshCw,
  SUBSCRIPTION_RENEWAL: RefreshCw,
  SUBSCRIPTION_CHANGE: RefreshCw,
  PACK: Ticket,
  PACK_EXTENSION: Clock,
};

/** The rows that need a second look: the money did not arrive or went back. */
const TROUBLE = new Set<PaymentStatus>(['FAILED', 'REVERSED']);

const troubleKey = (status: PaymentStatus) =>
  status === 'FAILED' ? ('trouble.FAILED' as const) : ('trouble.REVERSED' as const);

type Chip = PaymentGroup | null;
const CHIPS: readonly Chip[] = [null, 'SUBSCRIPTION', 'PACK'];

const LIST = 'overflow-hidden rounded-[1.25rem] border bg-card text-card-foreground';

/** The list's measure: dense rows read as one line each; wider only spreads them apart. */
const MEASURE = 'w-full max-w-240';

export function PaymentHistory({ collectionTitles }: { collectionTitles: Map<string, string> }) {
  const t = useTranslations('billing.history');
  const tBilling = useTranslations('billing');
  const format = useFormatter();
  const [group, setGroup] = useState<Chip>(null);
  const totals = useQuery({ queryKey: PAYMENT_TOTALS_KEY, queryFn: fetchPaymentTotals });
  const payments = useInfiniteQuery({
    queryKey: paymentsKey(group),
    queryFn: ({ pageParam }) => listPayments(pageParam ?? undefined, group ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = payments.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = totals.data?.counts;
  const paid = totals.data?.paidThisYear;

  return (
    <section aria-labelledby="history-title" className={cn(MEASURE, 'grid gap-5')}>
      {/* The tab «Історія платежів» names it on screen; the heading stays for the outline. */}
      <h2 id="history-title" className="sr-only">
        {t('title')}
      </h2>
      {counts === undefined || counts.all === 0 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GroupChips
            value={group}
            onChange={setGroup}
            label={(chip) =>
              t(`groups.${chip ?? ALL}`, { count: chip === null ? counts.all : counts[chip] })
            }
            name={t('groups.label')}
          />
          {paid === undefined || paid.amountMinor === 0 || totals.data === undefined ? null : (
            <p className="text-[0.9375rem] text-foreground-soft">
              {t.rich('year', {
                year: totals.data.year,
                amount: formatMoney(format.number, paid),
                b: (chunks) => <b className="font-bold text-foreground tabular-nums">{chunks}</b>,
              })}
            </p>
          )}
        </div>
      )}
      {payments.isPending ? (
        <div className={cn(LIST, 'grid gap-px')} aria-hidden="true">
          <Skeleton className="h-16 w-full rounded-none" />
          <Skeleton className="h-16 w-full rounded-none" />
          <Skeleton className="h-16 w-full rounded-none" />
        </div>
      ) : payments.isError ? (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void payments.refetch()}>
              {tBilling('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : items.length === 0 ? (
        <div className={cn(LIST, 'flex items-center gap-3 p-6 text-muted-foreground')}>
          <ReceiptText aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <ul aria-labelledby="history-title" className={LIST}>
          {items.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              {...(payment.collectionId === null
                ? {}
                : { collection: collectionTitles.get(payment.collectionId) })}
            />
          ))}
        </ul>
      )}
      {payments.hasNextPage ? (
        <Button
          variant="outline"
          className="h-11 justify-self-center rounded-xl px-5"
          aria-disabled={payments.isFetchingNextPage || undefined}
          onClick={() => {
            if (!payments.isFetchingNextPage) void payments.fetchNextPage();
          }}
        >
          {t('loadMore')}
        </Button>
      ) : null}
      {payments.isFetchNextPageError ? <Alert variant="error">{t('loadMoreFailed')}</Alert> : null}
    </section>
  );
}

const CHIP_ON = 'border-foreground bg-foreground font-semibold text-background';
const CHIP_OFF = 'border-input bg-card text-foreground hover:bg-hover-card';

/** «Усі · 4 / Підписка · 2 / Пакети · 2»: a radio group of pills (arrows move, one tab stop). */
function GroupChips({
  value,
  onChange,
  label,
  name,
}: {
  value: Chip;
  onChange: (chip: Chip) => void;
  label: (chip: Chip) => string;
  name: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = CHIPS.indexOf(value);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + CHIPS.length) % CHIPS.length;
    onChange(CHIPS[next] ?? null);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {CHIPS.map((chip, i) => {
        const checked = chip === value;
        return (
          <button
            key={chip ?? ALL}
            ref={(element) => {
              refs.current[i] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(chip)}
            onKeyDown={onKeyDown}
            className={cn(
              'h-10 rounded-full border px-4 text-[0.9375rem] tabular-nums pointer-coarse:h-11',
              checked ? CHIP_ON : CHIP_OFF,
              focusRing,
            )}
          >
            {label(chip)}
          </button>
        );
      })}
    </div>
  );
}

function PaymentRow({
  payment,
  collection,
}: {
  payment: PaymentDto;
  collection?: string | undefined;
}) {
  const t = useTranslations('billing.history');
  const format = useFormatter();
  const trouble = TROUBLE.has(payment.status);
  const Icon = KIND_ICON[payment.kind];
  const when = format.dateTime(new Date(payment.createdAt), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: KYIV,
  });
  const details = [
    collection ?? t(`kinds.${payment.kind}`),
    payment.refundedMinor > 0 && payment.status === 'PARTIALLY_REFUNDED'
      ? t('refunded', {
          amount: formatMoney(format.number, {
            amountMinor: payment.refundedMinor,
            currency: payment.currency,
          }),
        })
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <li
      data-slot="payment-row"
      data-status={payment.status}
      className={cn(
        'flex items-center gap-3.5 border-t border-muted px-4 py-3.5 first:border-t-0 md:gap-4 md:px-5',
        trouble && 'bg-warning-soft',
      )}
    >
      <span
        className={cn(
          'w-[6.875rem] shrink-0 text-sm tabular-nums max-md:hidden',
          trouble ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {when}
      </span>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground-soft max-sm:hidden"
      >
        <Icon className="size-4" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]">
          {payment.offerTitle}
        </span>
        <span
          className={cn(
            'text-[0.8125rem] leading-snug [overflow-wrap:anywhere]',
            trouble ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          <span className="tabular-nums md:hidden">{when + SEPARATOR}</span>
          {trouble ? t(troubleKey(payment.status)) : details.join(SEPARATOR)}
        </span>
      </span>
      <span className="flex shrink-0 items-end gap-1 max-md:flex-col-reverse md:w-[15.5rem] md:items-center md:justify-end md:gap-4">
        <Badge
          variant={ROW_BADGE[payment.status]}
          // On the amber row the pill keeps its edge: white under the amber words.
          className={cn(trouble && 'bg-card')}
        >
          {t(`statuses.${payment.status}`)}
        </Badge>
        <span className="text-right text-[0.9375rem] font-bold tabular-nums md:w-24">
          {formatMoney(format.number, payment)}
        </span>
      </span>
    </li>
  );
}
