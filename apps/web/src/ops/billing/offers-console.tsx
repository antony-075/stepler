'use client';

// Design pass (billing M4, Task 20; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The catalogue as the operator thinks of it: four groups in the order a
// customer meets them (trial, packs, pack extensions, subscriptions), each a short list of
// offers. One row per offer: title (a link to its editor) with the code in mono under it, the
// limits in a plain sentence («10 ГБ на колекцію, 10 посилань, збір 30 днів»), the live prices,
// and «У продажу» / «Не продається» as a badge with its word. «Найпопулярніший» is a quiet
// neutral badge, not a colour. Desktop: a three-column grid row; phones: the same stacked.
// «Нова пропозиція» is the page's one filled button.
import { useQuery } from '@tanstack/react-query';
import type { OfferKind, OperatorOffer } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { billingKeys, fetchOffers } from '../api/billing';
import { ListSkeleton } from './payments-console';
import { formatMinor, formatPlanBytes } from './plan-format';

const GROUPS: readonly OfferKind[] = ['TRIAL', 'PACK', 'PACK_EXTENSION', 'SUBSCRIPTION'];

export function OffersConsole() {
  const t = useTranslations('ops');
  const query = useQuery({
    queryKey: billingKeys.offers,
    queryFn: ({ signal }) => fetchOffers(signal),
  });

  return (
    <section aria-labelledby="ops-offers-title" className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid max-w-3xl gap-1">
          <h1 id="ops-offers-title" className="type-h1">
            {t('offers.title')}
          </h1>
          <p className="text-muted-foreground">{t('offers.intro')}</p>
        </div>
        <Button asChild>
          <Link href="/ops/billing/offers/new">{t('offers.create')}</Link>
        </Button>
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <Alert
          variant="error"
          title={t('offers.failed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : (
        GROUPS.map((kind) => {
          const offers = query.data.items.filter((offer) => offer.kind === kind);
          if (offers.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`ops-offers-${kind}`} className="grid gap-2">
              <h2 id={`ops-offers-${kind}`} className="type-h3">
                {t(`offers.kinds.${kind}`)}
              </h2>
              <ul className="divide-y rounded-sheet border bg-card">
                {offers.map((offer) => (
                  <OfferRow key={offer.id} offer={offer} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}

function OfferRow({ offer }: { offer: OperatorOffer }) {
  const t = useTranslations('ops.offers');
  const prices = usePriceText(offer);
  const limits = useLimitText(offer);
  return (
    <li className="relative grid gap-2 p-4 transition-colors hover:bg-hover-ghost has-[a:focus-visible]:bg-hover-ghost md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
      <div className="grid min-w-0 gap-0.5">
        <Link
          href={`/ops/billing/offers/${offer.id}`}
          className="font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {offer.titleUk}
        </Link>
        <span className="font-mono text-[0.8125rem] text-muted-foreground">{offer.code}</span>
      </div>
      <span className="text-[0.9375rem] text-foreground-soft">{limits}</span>
      <span className="text-[0.9375rem] tabular-nums">{prices}</span>
      <span className="flex flex-wrap gap-1.5 md:justify-end">
        {offer.highlighted ? <Badge variant="neutral">{t('highlighted')}</Badge> : null}
        <Badge variant={offer.active ? 'success' : 'neutral'}>
          {offer.active ? t('onSale') : t('offSale')}
        </Badge>
      </span>
    </li>
  );
}

/** The limits as one sentence, only those the offer has. */
export function useLimitText(offer: OperatorOffer): string {
  const t = useTranslations('ops.offers');
  const format = useFormatter();
  const { limits } = offer;
  const parts: string[] = [];
  if (offer.extension !== null) parts.push(t(`extensions.${offer.extension}`));
  if (limits.activeCollections !== null) {
    parts.push(t('limits.collections', { count: limits.activeCollections }));
  }
  if (limits.storageBytes !== null) {
    parts.push(t('limits.storage', { size: formatPlanBytes(format.number, limits.storageBytes) }));
  }
  if (limits.collectionStorageBytes !== null) {
    parts.push(
      t('limits.collectionStorage', {
        size: formatPlanBytes(format.number, limits.collectionStorageBytes),
      }),
    );
  }
  if (limits.guestLinks !== null) parts.push(t('limits.links', { count: limits.guestLinks }));
  if (limits.windowDays !== null) parts.push(t('limits.window', { count: limits.windowDays }));
  if (limits.retentionDays !== null) {
    parts.push(t('limits.retention', { count: limits.retentionDays }));
  }
  if (offer.durationDays !== null) parts.push(t('limits.duration', { count: offer.durationDays }));
  return parts.join(', ');
}

function usePriceText(offer: OperatorOffer): string {
  const t = useTranslations('ops.offers');
  const format = useFormatter();
  if (offer.kind === 'TRIAL') return t('trialFree');
  if (offer.extension === 'STORAGE') return t('storageDifference');
  if (offer.prices.length === 0) return t('noPrice');
  return offer.prices
    .map((price) =>
      t('priceLine', {
        amount: formatMinor(format.number, price.amountMinor, price.currency),
        interval: t(`intervals.${price.interval}`),
      }),
    )
    .join(', ');
}
