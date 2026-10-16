'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design, ui-ux-pro-max).
// The account's two limits as rows under the plan (DESIGN-SYSTEM.md §0.12): icon and label on the
// left, «2 з 3» right-aligned, a full-width 8px bar under them (the dashboard's `UsageBar`, with
// its minimum visible fill), and «2% використано» under the storage bar. A limit at 90% or more
// turns amber with «Майже вичерпано»; past it, red with an inline alert under the row that says
// what stops and links to «Тарифи» (a trial that ended with more collections than the plan
// allows). The words carry the numbers and the state; the bars are decorative. Pack collections
// are not counted here.
// Owner's pick 2026-10-16, one to one with direction C's Overview artboard: no visible title (an
// sr-only heading keeps the outline), two bordered cards side by side from `md`: «Сховище» first
// with «48 з 200 ГБ» muted on the right and a 14px bar, «Активні колекції» with one 40px slot per
// collection the plan allows (filled, then dashed free ones; a plan of more than 10 gets the bar
// instead) and «Ще 2 вільні місця. Заархівуйте завершену подію, щоб звільнити місце.» under
// them. That pack collections are not counted is the storage card's last line.
import type { UsageResponse } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { cn } from '@stepler/ui/lib/utils';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { UsageBar } from '@/app/app/usage-bar';
import { formatStorage } from '@/format/bytes';
import { billingHref } from './billing-tab';

/** Up to this many collections the plan's slots are drawn one by one. */
const MAX_SLOTS = 10;

/** From this share of a limit the row warns (amber). */
const NEAR_LIMIT = 0.9;

type Level = 'ok' | 'near' | 'over';

function levelOf(used: number, limit: number): Level {
  if (used > limit) return 'over';
  if (limit > 0 && used / limit >= NEAR_LIMIT) return 'near';
  return 'ok';
}

export function AccountUsage({ usage }: { usage: UsageResponse }) {
  const t = useTranslations('billing.usage');
  const format = useFormatter();
  const { activeCollections: slots, storage } = usage;
  const share = storage.limitBytes > 0 ? storage.usedBytes / storage.limitBytes : 0;
  const free = Math.max(0, slots.limit - slots.used);
  return (
    <section data-slot="account-usage" aria-labelledby="usage-title">
      <h2 id="usage-title" className="sr-only">
        {t('title')}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        <LimitRow
          label={t('storage')}
          value={t('of', {
            used: formatStorage(format.number, storage.usedBytes),
            limit: formatStorage(format.number, storage.limitBytes),
          })}
          used={storage.usedBytes}
          limit={storage.limitBytes}
          caption={`${t('used', {
            percent: format.number(share, { style: 'percent', maximumFractionDigits: 0 }),
          })}. ${t('note')}`}
          over={{ title: t('overStorage'), text: t('overStorageText') }}
        />
        <LimitRow
          label={t('collections')}
          value={t('of', { used: String(slots.used), limit: String(slots.limit) })}
          used={slots.used}
          limit={slots.limit}
          slots={slots.limit <= MAX_SLOTS}
          caption={free > 0 ? `${t('free', { count: free })}. ${t('freeHint')}` : undefined}
          over={{ title: t('overCollections'), text: t('overCollectionsText') }}
        />
      </div>
    </section>
  );
}

const SLOT_USED = 'bg-primary';
const SLOT_OVER = 'bg-destructive';
const SLOT_FREE = 'border-2 border-dashed border-border-strong';

function slotClass(index: number, used: number, limit: number, level: Level): string {
  if (index >= used) return SLOT_FREE;
  return level === 'over' && index >= limit ? SLOT_OVER : SLOT_USED;
}

const TONE: Record<Level, 'default' | 'warning' | 'destructive'> = {
  ok: 'default',
  near: 'warning',
  over: 'destructive',
};

/** One slot per collection the plan allows: used ones filled, free ones dashed (decorative). */
function Slots({ used, limit, level }: { used: number; limit: number; level: Level }) {
  return (
    <span
      aria-hidden="true"
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, limit)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: Math.max(limit, used) }, (_, index) => (
        <span
          key={index}
          className={cn('h-10 rounded-[0.625rem]', slotClass(index, used, limit, level))}
        />
      ))}
    </span>
  );
}

function LimitRow({
  label,
  value,
  used,
  limit,
  caption,
  slots = false,
  over,
}: {
  label: string;
  value: string;
  used: number;
  limit: number;
  caption?: string;
  /** Draw the plan's slots one by one instead of the bar. */
  slots?: boolean;
  over: { title: string; text: string };
}) {
  const t = useTranslations('billing');
  const level = levelOf(used, limit);
  const captions = [caption, level === 'near' ? t('usage.nearLimit') : undefined].filter(
    (part): part is string => part !== undefined,
  );
  const captionClass = cn(
    'flex flex-wrap gap-x-3 text-sm leading-normal text-pretty text-foreground-soft',
    level === 'near' && 'text-warning',
  );
  return (
    <div
      data-slot="limit-row"
      data-level={level}
      className="grid content-start gap-3.5 rounded-[1.25rem] border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h3 className="text-base font-semibold">{label}</h3>
        <span
          className={cn(
            'text-sm text-muted-foreground tabular-nums',
            level === 'over' && 'text-destructive',
            level === 'near' && 'text-warning',
          )}
        >
          {value}
        </span>
      </div>
      {slots ? (
        <Slots used={used} limit={limit} level={level} />
      ) : (
        <UsageBar
          used={used}
          limit={limit}
          tone={TONE[level]}
          className="h-3.5 w-full rounded-[7px] bg-muted"
        />
      )}
      {captions.length === 0 ? null : (
        <p className={captionClass}>
          {captions.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      )}
      {level === 'over' ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-destructive-soft px-3 py-2.5 text-sm">
          <p className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="grid gap-0.5 text-pretty">
              <span className="font-medium text-destructive">{over.title}</span>
              <span className="text-foreground-soft">{over.text}</span>
            </span>
          </p>
          <Button asChild variant="outline" size="sm" className="max-sm:w-full">
            <Link href={billingHref('plans')}>{t('access.choosePlan')}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
