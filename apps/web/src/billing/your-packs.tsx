'use client';

// Design pass (billing page v2; frontend-design, web-design-guidelines, responsive-design).
// «Ваші пакети», only when the account has pack collections: one panel, a row per collection like
// the account page's sections: the collection's picture or initials (44px), its name as a link,
// the pack's name, the two clocks as dates, the pack's storage used (mono, a thin meter), and on
// the right the extensions on sale (the collection page's `PackExtensions`: confirm, then LiqPay).
// On phones the actions wrap under the facts.
import type { Collection, CollectionPack } from '@stepler/contracts';
import { Panel } from '@stepler/ui/components/panel';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { CollectionMark } from '@/app/app/collection-mark';
import { PackExtensions } from '@/app/app/collections/[id]/pack-status';
import { UsageBar } from '@/app/app/usage-bar';
import { formatStorage } from '@/format/bytes';
import { monoDigits } from '@/format/mono-digits';

const KYIV = 'Europe/Kyiv';

type PackCollection = Collection & { pack: CollectionPack };

export function YourPacks({ collections }: { collections: Collection[] }) {
  const t = useTranslations('billing.yours');
  const packed = collections.filter((item): item is PackCollection => item.pack !== null);
  if (packed.length === 0) return null;
  return (
    <section aria-labelledby="your-packs-title" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="your-packs-title" className="type-h2">
          {t('title')}
        </h2>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>
      <Panel>
        <ul className="divide-y">
          {packed.map((collection) => (
            <PackRow key={collection.id} collection={collection} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}

function PackRow({ collection }: { collection: PackCollection }) {
  const t = useTranslations('collection.access');
  const tExtend = useTranslations('billing.extend');
  const format = useFormatter();
  const locale = useLocale();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const { pack, access } = collection;
  const live = collection.status === 'ACTIVE' && collection.blocked === null;
  return (
    <li
      data-slot="pack-row"
      className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <CollectionMark collection={collection} size="sm" className="rounded-control text-sm" />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <Link
              href={`/app/collections/${collection.id}`}
              className={cn(
                'truncate rounded-[3px] font-medium underline-offset-4 hover:underline',
                focusRing,
              )}
            >
              {collection.title}
            </Link>
            <span className="text-sm text-muted-foreground">
              {t('packTitle', { title: locale === 'en' ? pack.offerTitle.en : pack.offerTitle.uk })}
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-foreground-soft">
            <li>
              {access.state === 'ACTIVE'
                ? t('packWindowOpen', { date: date(pack.windowEndsAt) })
                : t('packWindowEnded', { date: date(pack.windowEndsAt) })}
            </li>
            <li>{t('packRetention', { date: date(pack.retentionEndsAt) })}</li>
          </ul>
          <div className="flex max-w-xs items-center gap-2.5 pt-0.5">
            <span className="shrink-0 text-sm text-muted-foreground">
              {monoDigits(
                tExtend('storageUse', {
                  used: formatStorage(format.number, collection.storageBytes),
                  limit: formatStorage(format.number, pack.storageBytes),
                }),
                'font-mono text-[0.8125rem] text-foreground tabular-nums',
              )}
            </span>
            <UsageBar
              used={collection.storageBytes}
              limit={pack.storageBytes}
              className="w-full min-w-12"
            />
          </div>
        </div>
      </div>
      {live ? (
        <div className="lg:max-w-md">
          <PackExtensions collectionId={collection.id} offerId={pack.offerId} />
        </div>
      ) : null}
    </li>
  );
}
