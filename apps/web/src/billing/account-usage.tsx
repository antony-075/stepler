'use client';

// Design pass (billing page v2; ui-ux-pro-max, responsive-design). The account's two limits as
// two meters beside the plan: the label, «2 з 3» in mono and a 6px bar (the dashboard's
// `UsageBar`, with its minimum visible fill), side by side from `sm`, stacked on phones. The
// words carry the numbers; the bars are decorative. Pack collections are not counted here.
import type { UsageResponse } from '@stepler/contracts';
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from '@stepler/ui/components/panel';
import { FolderOpen, HardDrive, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { UsageBar } from '@/app/app/usage-bar';
import { formatStorage } from '@/format/bytes';
import { monoDigits } from '@/format/mono-digits';

export function AccountUsage({ usage }: { usage: UsageResponse }) {
  const t = useTranslations('billing.usage');
  const format = useFormatter();
  const { activeCollections: slots, storage } = usage;
  return (
    <Panel data-slot="account-usage" className="h-full">
      <PanelHeader>
        <PanelTitle>{t('title')}</PanelTitle>
        <PanelDescription>{t('note')}</PanelDescription>
      </PanelHeader>
      <PanelContent className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <Meter
          icon={FolderOpen}
          label={t('collections')}
          value={t('of', { used: String(slots.used), limit: String(slots.limit) })}
          used={slots.used}
          limit={slots.limit}
        />
        <Meter
          icon={HardDrive}
          label={t('storage')}
          value={t('of', {
            used: formatStorage(format.number, storage.usedBytes),
            limit: formatStorage(format.number, storage.limitBytes),
          })}
          used={storage.usedBytes}
          limit={storage.limitBytes}
        />
      </PanelContent>
    </Panel>
  );
}

function Meter({
  icon: Icon,
  label,
  value,
  used,
  limit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  used: number;
  limit: number;
}) {
  return (
    <div className="grid content-start gap-2.5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </p>
      <p className="text-lg leading-none font-medium text-foreground-soft">
        {monoDigits(value, 'font-mono font-semibold tracking-tight text-foreground tabular-nums')}
      </p>
      <UsageBar used={used} limit={limit} className="h-1.5 w-full bg-border" />
    </div>
  );
}
