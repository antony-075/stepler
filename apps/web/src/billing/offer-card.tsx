// Design pass (billing M2, Task 14; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). One pack, read top to bottom the way an owner decides on a phone:
// - its name, then the price as the one large thing (Golos Text with tabular figures: the price
//   carries «₴», and Cyrillic stays in Golos, DESIGN-SYSTEM.md §0.11) with «одноразово» beside
//   it, because «no subscription» is the reassurance that matters;
// - four facts in plain words with quiet icons: storage, how long guests add, how long it is
//   kept, guest links. No badge «популярний», no gradient, no comparison grid: two tiers do not
//   need one, and the V1 «Графіт» panels carry the hierarchy (DESIGN-SYSTEM.md §0);
// - the action is a slot at the bottom (a link on /pricing, a button in «Тариф і оплата»), full
//   width on phones so the thumb finds it, 44px on touch screens.
// Works in server and client components alike (next-intl's sync hooks).
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { CalendarClock, HardDrive, Link2, ShieldCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { formatMoney, type PricedOffer, retentionYears } from './offers';

export function PackCard({ pack, action }: { pack: PricedOffer; action: ReactNode }) {
  const t = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = pack.offer;
  const storage =
    limits.collectionStorageBytes === null ? null : Number(limits.collectionStorageBytes);
  const years = limits.retentionDays === null ? null : retentionYears(limits.retentionDays);
  const facts: { icon: ReactNode; text: string }[] = [];
  if (storage !== null) {
    facts.push({
      icon: <HardDrive />,
      text: t('storage', {
        size: formatStorage(format.number, storage),
      }),
    });
  }
  if (limits.windowDays !== null) {
    facts.push({ icon: <CalendarClock />, text: t('window', { days: limits.windowDays }) });
  }
  if (limits.retentionDays !== null) {
    facts.push({
      icon: <ShieldCheck />,
      text:
        years === null
          ? t('retentionDays', { days: limits.retentionDays })
          : t('retentionYears', { years }),
    });
  }
  if (limits.guestLinks !== null) {
    facts.push({ icon: <Link2 />, text: t('links', { count: limits.guestLinks }) });
  }
  return (
    <Panel className="h-full" data-testid={`pack-${pack.offer.code}`}>
      <PanelContent className="flex h-full flex-col gap-5">
        <div className="grid gap-1">
          <h3 className="type-h2">{pack.offer.title}</h3>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(format.number, pack.price)}
            </span>
            <span className="text-sm text-muted-foreground">{t('oneTime')}</span>
          </p>
          {pack.offer.description === null ? null : (
            <p className="text-sm text-pretty text-muted-foreground">{pack.offer.description}</p>
          )}
        </div>
        <ul className="grid gap-2.5 text-foreground-soft">
          {facts.map((fact) => (
            <li key={fact.text} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0"
              >
                {fact.icon}
              </span>
              <span className="text-pretty">{fact.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto grid pt-1">{action}</div>
      </PanelContent>
    </Panel>
  );
}
