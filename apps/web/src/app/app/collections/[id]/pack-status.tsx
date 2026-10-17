'use client';

// Design pass (billing M1 Task 7, M2 Task 14; frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design). What billing means for this one collection (ADR 0018
// [P2], [P4], [P5]), above the tabs with the operator's block and the archive notice, so it shows
// on every tab:
// - a pack collection: «Збір завершено {date}» (warning) after the window; «Термін зберігання
//   минув» (warning) after the retention, whose sentence is what disabled buttons point to
//   (`collection-access-reason`); then the pack itself in one quiet panel: its name, the two
//   clocks as dates, the storage used against the pack's (tabular figures, a thin meter) and the
//   extensions on sale as outline buttons that wrap on phones («Продовжити збір на 30 днів»,
//   «Продовжити зберігання на рік», «Збільшити обсяг до 50 ГБ»); each confirms the amount before
//   the hand-off to LiqPay;
// - a scheduled deletion: «Буде видалено {date}» with «Обрати тариф», the one date that matters;
// - an account collection on the trial (or with no plan): one quiet line «Купити пакет для цієї
//   колекції» that opens «Тариф і оплата» with this collection chosen;
// - an account collection that is merely read-only shows nothing else here: the account banner
//   above the page already says it once. Dates in Kyiv time, words, never a countdown.
import type { Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { Progress } from '@stepler/ui/components/progress';
import { cn } from '@stepler/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { fetchOffers, offersKey } from '@/api/billing';
import { billingHref } from '@/billing/billing-tab';
import { useCheckout } from '@/billing/checkout-redirect';
import { extensionOffer, formatMoney, type PricedOffer, storageUpgrade } from '@/billing/offers';
import { formatStorage } from '@/format/bytes';
import { COLLECTION_ACCESS_REASON_ID } from '../../access-model';

const KYIV = 'Europe/Kyiv';

/** Account reasons under which a pack is the natural way to keep a collection going. */
const PACK_SUGGESTED = new Set(['TRIAL', 'TRIAL_ENDED', 'SUBSCRIPTION_ENDED', 'NONE']);

export function PackStatus({ collection }: { collection: Collection | CollectionDetail }) {
  const t = useTranslations('collection.access');
  const tExtend = useTranslations('billing.extend');
  const format = useFormatter();
  const locale = useLocale();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const { pack, access, deleteAfter } = collection;
  const live = collection.status === 'ACTIVE' && collection.blocked === null;
  const choose = (
    <Button asChild variant="outline">
      <Link href={billingHref('plans')}>{t('choosePlan')}</Link>
    </Button>
  );
  const deletion =
    deleteAfter === null ? null : (
      <span className="block">{t('deleteAfter', { date: date(deleteAfter) })}</span>
    );

  let notice = null;
  if (pack !== null && access.state === 'READ_ONLY') {
    notice = (
      <Alert variant="warning" role="status" title={t('packReadOnlyTitle')}>
        <span id={COLLECTION_ACCESS_REASON_ID} className="block">
          {t('packReadOnlyText')}
        </span>
        {deletion}
      </Alert>
    );
  } else if (pack !== null && access.state === 'COLLECTING_CLOSED') {
    notice = (
      <Alert
        variant="warning"
        role="status"
        title={t('packClosedTitleDate', { date: date(pack.windowEndsAt) })}
      >
        {t('packClosedText', { date: date(pack.retentionEndsAt) })}
      </Alert>
    );
  } else if (deletion !== null) {
    // An account collection: the account banner above already offers «Обрати тариф».
    notice = (
      <Alert variant="warning" role="status" action={pack === null ? choose : undefined}>
        {deletion}
      </Alert>
    );
  }

  if (pack === null) {
    const suggest = live && PACK_SUGGESTED.has(access.reason);
    return (
      <>
        {notice}
        {suggest ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <CreditCard aria-hidden="true" className="size-4" />
            <span>{tExtend('buyForCollectionText')}</span>
            <Link
              href={`/app/billing?collection=${collection.id}`}
              className="inline-flex min-h-11 items-center font-medium text-link underline-offset-4 hover:underline md:min-h-0"
            >
              {tExtend('buyForCollection')}
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  const used = 'storage' in collection ? collection.storage.usedBytes : null;
  return (
    <>
      {notice}
      <Panel>
        <PanelContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="grid gap-2">
            <p className="font-medium">
              {t('packTitle', {
                title: locale === 'en' ? pack.offerTitle.en : pack.offerTitle.uk,
              })}
            </p>
            <ul className="grid gap-0.5 text-sm text-foreground-soft">
              <li>
                {access.state === 'ACTIVE'
                  ? t('packWindowOpen', { date: date(pack.windowEndsAt) })
                  : t('packWindowEnded', { date: date(pack.windowEndsAt) })}
              </li>
              <li>{t('packRetention', { date: date(pack.retentionEndsAt) })}</li>
            </ul>
            {used === null ? null : (
              <div className="grid max-w-xs gap-1">
                <Progress
                  value={pack.storageBytes === 0 ? 0 : (used / pack.storageBytes) * 100}
                  label={t('packStorage')}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
                  {tExtend('storageUse', {
                    used: formatStorage(format.number, used),
                    limit: formatStorage(format.number, pack.storageBytes),
                  })}
                </span>
              </div>
            )}
          </div>
          {live ? <PackExtensions collectionId={collection.id} offerId={pack.offerId} /> : null}
        </PanelContent>
      </Panel>
    </>
  );
}

type Extension = { key: string; label: string; priceId: string; amount: PricedOffer['price'] };

export function PackExtensions({
  collectionId,
  offerId,
  className = 'md:max-w-sm md:justify-end',
}: {
  collectionId: string;
  offerId: string;
  /** Where the buttons sit: right-aligned beside the pack on the collection page by default. */
  className?: string;
}) {
  const tExtend = useTranslations('billing.extend');
  const format = useFormatter();
  const locale = useLocale();
  const offers = useQuery({ queryKey: offersKey(locale), queryFn: () => fetchOffers(locale) });
  const checkout = useCheckout();
  const [chosen, setChosen] = useState<Extension | null>(null);
  if (offers.data === undefined) return null;

  const extensions: Extension[] = [];
  for (const kind of ['WINDOW', 'RETENTION'] as const) {
    const offer = extensionOffer(offers.data, kind);
    if (offer !== null) {
      extensions.push({
        key: kind,
        label: offer.offer.title,
        priceId: offer.priceId,
        amount: offer.price,
      });
    }
  }
  const upgrade = storageUpgrade(offers.data, offerId);
  if (upgrade !== null) {
    const bytes = Number(upgrade.target.offer.limits.collectionStorageBytes ?? 0);
    extensions.push({
      key: 'STORAGE',
      label: tExtend('upgrade', {
        size: formatStorage(format.number, bytes),
      }),
      priceId: upgrade.target.priceId,
      amount: upgrade.difference,
    });
  }
  if (extensions.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {extensions.map((extension) => (
        <Button key={extension.key} variant="outline" onClick={() => setChosen(extension)}>
          {extension.label}
        </Button>
      ))}
      {chosen === null ? null : (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !checkout.pending) {
              setChosen(null);
              checkout.reset();
            }
          }}
          title={chosen.label}
          description={tExtend('confirmText', {
            amount: formatMoney(format.number, chosen.amount),
          })}
          confirmLabel={tExtend('confirm')}
          cancelLabel={tExtend('cancel')}
          pendingLabel={tExtend('pending')}
          confirmIcon={<CreditCard aria-hidden="true" />}
          errorMessage={checkout.errorMessage ?? tExtend('failed')}
          onConfirm={async () => {
            await checkout.start({
              kind: 'PACK_EXTENSION',
              priceId: chosen.priceId,
              collectionId,
            });
            // The hand-off takes over the window: the dialog stays pending until the page leaves.
            await new Promise<void>(() => undefined);
          }}
        />
      )}
      {checkout.handoff}
    </div>
  );
}
