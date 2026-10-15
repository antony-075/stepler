'use client';

// Design pass (billing M4, Task 20; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). One offer on one page, desktop-first and usable at 360:
// - the heading is the offer's title with its code in mono and the sale badge;
// - three panels in the order of risk: «Ціни» (one row per period the kind is sold in: the live
//   price in words, a ₴ field with two decimals, «Зберегти ціну»), «Продаж» (start / take off
//   sale, the latter destructive; the trial explains why it cannot be switched off), and the
//   form with titles and limits (GB for storage, binary as sold);
// - every change asks for a reason in the shared dialog and ends in a toast; a rule the database
//   enforces (which limits a kind needs) comes back as a sentence above the save button;
// - the trial carries a note that its limits apply to running trials at once (by design).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperatorOffer } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { ChevronLeft } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import type { OpsAction } from '../actions';
import {
  billingKeys,
  createOffer,
  fetchOffers,
  setOfferActive,
  setOfferPrice,
  updateOffer,
} from '../api/billing';
import { isOpsApiError } from '../api/client';
import { ReasonDialog } from '../reason-dialog';
import { formatMoneyInput, parseMoneyInput } from './form-units';
import {
  type LimitField,
  type OfferFormValues,
  priceIntervalsOf,
  toOfferBody,
} from './offer-fields';
import { OfferForm } from './offer-form';
import { formatMinor } from './plan-format';

const NEW = 'new';
const ON_SALE = 'success';
const OFF_SALE = 'neutral';

/** A change waiting for its reason: the dialog's action and what to call with the reason. */
interface Pending {
  action: OpsAction;
  run: (reason: string) => Promise<OperatorOffer>;
}

export function OfferEditor({ id }: { id: string }) {
  const t = useTranslations('ops');
  const query = useQuery({
    queryKey: billingKeys.offers,
    queryFn: ({ signal }) => fetchOffers(signal),
    enabled: id !== NEW,
  });
  const back = (
    <Link
      href="/ops/billing/offers"
      className="inline-flex min-h-11 items-center gap-1 text-[0.875rem] text-link hover:underline md:min-h-9"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {t('offers.back')}
    </Link>
  );
  if (id === NEW) return <Editor back={back} offer={null} />;
  if (query.isPending) {
    return (
      <div aria-hidden="true" className="grid max-w-4xl gap-4">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-sheet" />
        <Skeleton className="h-96 rounded-sheet" />
      </div>
    );
  }
  const offer = query.data?.items.find((item) => item.id === id);
  if (query.isError || offer === undefined) {
    return (
      <div className="grid max-w-4xl gap-4">
        {back}
        {query.isError ? (
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
          <div className="rounded-sheet border bg-card">
            <EmptyState title={t('offers.notFound')} />
          </div>
        )}
      </div>
    );
  }
  return <Editor key={offer.updatedAt} back={back} offer={offer} />;
}

function Editor({ back, offer }: { back: ReactNode; offer: OperatorOffer | null }) {
  const t = useTranslations('ops');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const confirm = async (reason: string) => {
    if (pending === null) return;
    const { action, run } = pending;
    let saved: OperatorOffer;
    try {
      saved = await run(reason);
    } catch (error) {
      const message = isOpsApiError(error, 'VALIDATION_FAILED')
        ? action === 'priceSet'
          ? t('offers.priceError')
          : t('offers.form.shapeError')
        : isOpsApiError(error, 'NOT_FOUND')
          ? t('actions.gone')
          : t('actions.failed');
      if (action === 'offerSave' || action === 'offerCreate') setFormError(message);
      throw new Error(message, { cause: error });
    }
    setFormError(null);
    await queryClient.invalidateQueries({ queryKey: billingKeys.all });
    toast({ variant: 'success', title: t(`actions.${action}.done`) });
    if (action === 'offerCreate') router.replace(`/ops/billing/offers/${saved.id}`);
  };

  const save = (values: OfferFormValues, fields: readonly LimitField[]) => {
    const body = toOfferBody(values, fields);
    setPending(
      offer === null
        ? {
            action: 'offerCreate',
            run: (reason) =>
              createOffer({
                ...body,
                code: values.code,
                kind: values.kind,
                extension: values.kind === 'PACK_EXTENSION' ? values.extension : null,
                reason,
              }),
          }
        : { action: 'offerSave', run: (reason) => updateOffer(offer.id, { ...body, reason }) },
    );
  };

  return (
    <article aria-labelledby="ops-offer-title" className="grid max-w-4xl gap-5">
      {back}
      <header className="grid gap-2">
        <h1 id="ops-offer-title" className="type-h1">
          {offer === null ? t('offers.newTitle') : t('offers.editTitle', { title: offer.titleUk })}
        </h1>
        {offer === null ? (
          <p className="text-muted-foreground">{t('offers.form.createdNote')}</p>
        ) : (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.875rem] text-muted-foreground">{offer.code}</span>
            <Badge variant={offer.active ? ON_SALE : OFF_SALE}>
              {offer.active ? t('offers.onSale') : t('offers.offSale')}
            </Badge>
            {offer.highlighted ? <Badge variant="neutral">{t('offers.highlighted')}</Badge> : null}
          </p>
        )}
      </header>

      {offer === null ? null : (
        <>
          <PricesPanel offer={offer} onSet={setPending} />
          <SalePanel offer={offer} onChange={setPending} />
        </>
      )}

      <Panel aria-labelledby="ops-offer-form">
        <PanelHeader>
          <PanelTitle id="ops-offer-form">{t('offers.form.title')}</PanelTitle>
          {offer?.kind === 'TRIAL' ? (
            <PanelDescription>{t('offers.form.trialNote')}</PanelDescription>
          ) : null}
        </PanelHeader>
        <PanelContent>
          <OfferForm offer={offer} error={formError} onSubmit={save} />
        </PanelContent>
      </Panel>

      <ReasonDialog
        action={pending?.action ?? null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirm}
      />
    </article>
  );
}

function PricesPanel({
  offer,
  onSet,
}: {
  offer: OperatorOffer;
  onSet: (pending: Pending) => void;
}) {
  const t = useTranslations('ops.offers');
  const intervals = priceIntervalsOf(offer.kind, offer.extension);
  return (
    <Panel aria-labelledby="ops-offer-prices">
      <PanelHeader>
        <PanelTitle id="ops-offer-prices">{t('pricesTitle')}</PanelTitle>
        <PanelDescription>
          {offer.kind === 'TRIAL'
            ? t('noPricesForTrial')
            : intervals.length === 0
              ? t('noPricesForStorage')
              : t('pricesHelp')}
        </PanelDescription>
      </PanelHeader>
      {intervals.length === 0 ? null : (
        <PanelContent className="grid gap-4">
          {intervals.map((interval) => (
            <PriceRow
              key={`${interval}-${offer.updatedAt}-${offer.prices.map((p) => p.id).join()}`}
              offer={offer}
              interval={interval}
              onSet={onSet}
            />
          ))}
        </PanelContent>
      )}
    </Panel>
  );
}

function PriceRow({
  offer,
  interval,
  onSet,
}: {
  offer: OperatorOffer;
  interval: 'ONE_TIME' | 'MONTH' | 'YEAR';
  onSet: (pending: Pending) => void;
}) {
  const t = useTranslations('ops.offers');
  const format = useFormatter();
  const current = offer.prices.find(
    (price) => price.interval === interval && price.currency === 'UAH',
  );
  const [text, setText] = useState(
    current === undefined ? '' : formatMoneyInput(current.amountMinor),
  );
  const [touched, setTouched] = useState(false);
  const amount = parseMoneyInput(text);
  const id = `offer-price-${interval}`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (amount === null || amount === current?.amountMinor) return;
    onSet({
      action: 'priceSet',
      run: (reason) =>
        setOfferPrice(offer.id, { interval, currency: 'UAH', amountMinor: amount, reason }),
    });
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-3 sm:flex sm:items-end">
      <Field
        id={id}
        label={t('priceField', { interval: t(`intervals.${interval}`) })}
        description={
          current === undefined
            ? t('priceNone')
            : t('priceCurrent', {
                amount: formatMinor(format.number, current.amountMinor, current.currency),
              })
        }
        error={touched && amount === null ? t('priceError') : undefined}
        className="sm:w-64"
      >
        {(control) => (
          <Input
            {...control}
            inputMode="decimal"
            autoComplete="off"
            className="tabular-nums"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="outline">
        {t('setPrice')}
      </Button>
    </form>
  );
}

function SalePanel({
  offer,
  onChange,
}: {
  offer: OperatorOffer;
  onChange: (pending: Pending) => void;
}) {
  const t = useTranslations('ops.offers');
  const trial = offer.kind === 'TRIAL';
  const priced = offer.prices.length > 0 || offer.extension === 'STORAGE';
  return (
    <Panel aria-labelledby="ops-offer-sale">
      <PanelHeader>
        <PanelTitle id="ops-offer-sale">{t('saleTitle')}</PanelTitle>
        <PanelDescription>
          {trial ? t('trialAlwaysOn') : offer.active ? t('saleOn') : t('saleOff')}
        </PanelDescription>
      </PanelHeader>
      {trial ? null : (
        <PanelContent className="grid gap-3">
          {!priced ? <Alert variant="info">{t('saleNoPrice')}</Alert> : null}
          <div>
            {offer.active ? (
              <Button
                variant="destructive"
                onClick={() =>
                  onChange({
                    action: 'offerDeactivate',
                    run: (reason) => setOfferActive(offer.id, false, reason),
                  })
                }
              >
                {t('deactivate')}
              </Button>
            ) : (
              <Button
                onClick={() =>
                  onChange({
                    action: 'offerActivate',
                    run: (reason) => setOfferActive(offer.id, true, reason),
                  })
                }
              >
                {t('activate')}
              </Button>
            )}
          </div>
        </PanelContent>
      )}
    </Panel>
  );
}
