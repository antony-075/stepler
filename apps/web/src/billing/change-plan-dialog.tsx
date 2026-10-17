'use client';

// Design pass (billing M3, Task 18; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). Changing the plan shows the server's own preview before anything happens
// ([P10], [P11]); the dialog never computes money itself:
// - upgrade: «Доплата зараз: 350,00 ₴, далі 1 200,00 ₴/міс» as the one large line, then why the
//   amount is what it is (the days left) and that the limits apply at once;
// - downgrade: «З 15 листопада: Pro, 500,00 ₴/міс», the current plan runs until then;
// - monthly ↔ yearly (B14): «З 15 листопада — щорічно, 4 990,00 ₴», nothing is paid now; at
//   the period end the owner confirms the new subscription through LiqPay;
// - a smaller plan that does not fit: the list of what to free («Архівуйте або видаліть 2
//   колекції», «Звільніть 30 ГБ») instead of a confirm button, so the owner knows what to do.
import type { PlanChangePreview, PlanExcess } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@stepler/ui/components/dialog';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { BILLING_KEY, changePreviewKey, fetchChangePreview } from '@/api/billing';
import { USAGE_KEY } from '@/api/collections';
import { formatStorage } from '@/format/bytes';
import { useCheckout } from './checkout-redirect';
import { formatMoney, type PricedPlan } from './offers';
import { usePlanPrice } from './plan-picker';

const KYIV = 'Europe/Kyiv';

export function ChangePlanDialog({
  plan,
  open,
  onOpenChange,
  collectionTitles,
}: {
  plan: PricedPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionTitles: Map<string, string>;
}) {
  const t = useTranslations('billing.change');
  const format = useFormatter();
  const planPrice = usePlanPrice();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const preview = useQuery({
    queryKey: changePreviewKey(plan.priceId),
    queryFn: () => fetchChangePreview(plan.priceId),
    enabled: open,
    staleTime: 0,
  });
  const checkout = useCheckout((res) => {
    void queryClient.invalidateQueries({ queryKey: BILLING_KEY });
    void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
    toast({ variant: 'success', title: t(res.status === 'SCHEDULED' ? 'scheduled' : 'applied') });
    onOpenChange(false);
  });
  const date = (iso: string | null) =>
    iso === null ? '' : format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const price = planPrice(plan);
  const data = preview.data;
  const blocked = data?.blocked ?? null;

  const confirm = () => {
    if (checkout.pending) return;
    void checkout
      .start({ kind: 'SUBSCRIPTION_CHANGE', priceId: plan.priceId })
      .catch(() => undefined);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (checkout.pending) return;
          if (!next) checkout.reset();
          onOpenChange(next);
        }}
      >
        <DialogContent closeLabel={t('cancel')}>
          <DialogHeader>
            <DialogTitle>{t('title', { title: plan.offer.title })}</DialogTitle>
            <DialogDescription>{price}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4" aria-live="polite">
            {preview.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : preview.isError || data === undefined ? (
              <Alert variant="error">{t('previewFailed')}</Alert>
            ) : blocked !== null ? (
              <Blocked title={plan.offer.title} excess={blocked} titles={collectionTitles} />
            ) : (
              <Summary preview={data} price={price} date={date} />
            )}
            {checkout.errorMessage === null ? null : (
              <Alert variant="error">{checkout.errorMessage}</Alert>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={checkout.pending}>
                {blocked === null ? t('cancel') : t('close')}
              </Button>
            </DialogClose>
            {data === undefined || blocked !== null ? null : (
              <Button type="button" aria-disabled={checkout.pending || undefined} onClick={confirm}>
                {checkout.pending ? <Spinner label={t('pending')} /> : null}
                {t(confirmKey(data))}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {checkout.handoff}
    </>
  );
}

function confirmKey(preview: PlanChangePreview): 'confirmPay' | 'confirmApply' | 'confirmSchedule' {
  if (preview.kind !== 'UPGRADE') return 'confirmSchedule';
  if (preview.kind === 'UPGRADE' && preview.waived) return 'confirmApply';
  return 'confirmPay';
}

function Summary({
  preview,
  price,
  date,
}: {
  preview: PlanChangePreview;
  price: string;
  date: (iso: string | null) => string;
}) {
  const t = useTranslations('billing.change');
  const format = useFormatter();
  const charge = formatMoney(format.number, {
    amountMinor: preview.chargeMinor,
    currency: preview.price.currency,
  });
  const when = date(preview.effectiveAt);
  let headline: string;
  let text: string;
  if (preview.kind === 'UPGRADE') {
    headline = preview.waived ? t('upgradeWaived', { price }) : t('upgradeNow', { charge, price });
    text = t('upgradeText');
  } else if (preview.kind === 'DOWNGRADE') {
    headline = t('downgrade', { date: when, title: preview.offerTitle, price });
    text = t('downgradeText', { date: when });
  } else {
    headline = t('switch', {
      date: when,
      interval: preview.interval,
      amount: formatMoney(format.number, preview.price),
    });
    text = t('switchText', { date: when });
  }
  return (
    <div className="grid gap-2 border-t pt-4">
      <p className="text-lg font-semibold text-pretty tabular-nums">{headline}</p>
      <p className="text-sm text-pretty text-foreground-soft">{text}</p>
    </div>
  );
}

function Blocked({
  title,
  excess,
  titles,
}: {
  title: string;
  excess: PlanExcess[];
  titles: Map<string, string>;
}) {
  const t = useTranslations('billing.change');
  const format = useFormatter();
  const line = (item: PlanExcess): string => {
    const over = item.used - item.allowed;
    const collection = item.collectionId === null ? '' : (titles.get(item.collectionId) ?? '');
    switch (item.limit) {
      case 'activeCollections':
        return t('blocked.activeCollections', { count: over });
      case 'storageBytes':
        return t('blocked.storageBytes', { size: formatStorage(format.number, over) });
      case 'collectionStorageBytes':
        return t('blocked.collectionStorageBytes', {
          size: formatStorage(format.number, over),
          title: collection,
        });
      default:
        return t('blocked.guestLinks', { count: over, title: collection });
    }
  };
  return (
    <Alert variant="warning">
      <p className="font-medium">{t('blockedTitle', { title })}</p>
      <ul className="mt-1.5 grid list-disc gap-1 pl-5">
        {excess.map((item) => (
          <li key={excessKey(item)}>{line(item)}</li>
        ))}
      </ul>
    </Alert>
  );
}

function excessKey(item: PlanExcess): string {
  return `${item.limit}:${item.collectionId ?? ''}`;
}
