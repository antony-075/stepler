'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design, ui-ux-pro-max).
// The account's two limits as rows under the plan (DESIGN-SYSTEM.md §0.12): icon and label on the
// left, «2 з 3» right-aligned, a full-width 8px bar under them (the dashboard's `UsageBar`, with
// its minimum visible fill), and «2% використано» under the storage bar. A limit at 90% or more
// turns amber with «Майже вичерпано»; past it, red with an inline alert under the row that says
// what stops and links to «Тарифи» (a trial that ended with more collections than the plan
// allows). The words carry the numbers and the state; the bars are decorative. Pack collections
// are not counted here: that note is the InfoTip beside the title.
import type { UsageResponse } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { InfoTip } from '@stepler/ui/components/info-tip';
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@stepler/ui/components/panel';
import { cn } from '@stepler/ui/lib/utils';
import { CircleAlert, FolderOpen, HardDrive, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { UsageBar } from '@/app/app/usage-bar';
import { formatStorage } from '@/format/bytes';
import { billingHref } from './billing-tab';

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
  return (
    <Panel data-slot="account-usage">
      <PanelHeader>
        <div className="flex items-center gap-1.5">
          <PanelTitle>{t('title')}</PanelTitle>
          <InfoTip text={t('note')} />
        </div>
      </PanelHeader>
      <PanelContent className="grid gap-6">
        <LimitRow
          icon={FolderOpen}
          label={t('collections')}
          value={t('of', { used: String(slots.used), limit: String(slots.limit) })}
          used={slots.used}
          limit={slots.limit}
          over={{ title: t('overCollections'), text: t('overCollectionsText') }}
        />
        <LimitRow
          icon={HardDrive}
          label={t('storage')}
          value={t('of', {
            used: formatStorage(format.number, storage.usedBytes),
            limit: formatStorage(format.number, storage.limitBytes),
          })}
          used={storage.usedBytes}
          limit={storage.limitBytes}
          caption={t('used', {
            percent: format.number(share, { style: 'percent', maximumFractionDigits: 0 }),
          })}
          over={{ title: t('overStorage'), text: t('overStorageText') }}
        />
      </PanelContent>
    </Panel>
  );
}

function LimitRow({
  icon: Icon,
  label,
  value,
  used,
  limit,
  caption,
  over,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  used: number;
  limit: number;
  caption?: string;
  over: { title: string; text: string };
}) {
  const t = useTranslations('billing');
  const level = levelOf(used, limit);
  const captions = [caption, level === 'near' ? t('usage.nearLimit') : undefined].filter(
    (part): part is string => part !== undefined,
  );
  const captionClass = cn(
    'col-start-2 -mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground',
    level === 'near' && 'text-warning',
  );
  return (
    <div
      data-slot="limit-row"
      data-level={level}
      className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5"
    >
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            level === 'over' && 'text-destructive',
            level === 'near' && 'text-warning',
          )}
        >
          {value}
        </span>
      </div>
      <UsageBar
        used={used}
        limit={limit}
        tone={level === 'over' ? 'destructive' : level === 'near' ? 'warning' : 'default'}
        className="col-start-2 h-2 w-full bg-border"
      />
      {captions.length === 0 ? null : (
        <p className={captionClass}>
          {captions.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      )}
      {level === 'over' ? (
        <div className="col-start-2 mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-destructive-soft px-3 py-2.5 text-sm">
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
