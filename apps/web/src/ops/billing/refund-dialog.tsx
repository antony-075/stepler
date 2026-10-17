'use client';

// Design pass (billing M4, Task 21; frontend-design, ui-ux-pro-max, web-design-guidelines):
// money leaves the business here, so the dialog states exactly what happens before the button
// does it. The amount is pre-filled with everything still refundable (the common case is a full
// refund) and can be lowered; below it a live sentence «Буде повернено 300,00 ₴ на картку
// покупця» repeats the amount in the money format, so a typo (3000 vs 300) is visible before the
// click. A reason is required (audit). One Idempotency-Key per opened dialog: a double click or a
// retry after a timeout never refunds twice. The dialog stays open on an error and shows it.
import { MODERATION_TEXT_MAX_CHARS, moderationTextSchema } from '@stepler/contracts';
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
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { Textarea } from '@stepler/ui/components/textarea';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isOpsApiError } from '../api/client';
import { refundPayment } from '../api/billing';
import { formatMoneyInput, parseMoneyInput } from './form-units';
import { formatMinor } from './plan-format';

/** Keeps the live sentence's line when there is nothing to say yet. */
const BLANK = '\u00a0';

export interface RefundTarget {
  paymentId: string;
  refundableMinor: number;
  currency: string;
}

export type RefundOutcome = 'SUCCEEDED' | 'PENDING';

export function RefundDialog({
  target,
  onOpenChange,
  onDone,
}: {
  /** `null` keeps the dialog closed. */
  target: RefundTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: (outcome: RefundOutcome) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target === null ? null : (
        <RefundForm
          key={target.paymentId}
          target={target}
          onOpenChange={onOpenChange}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}

function RefundForm({
  target,
  onOpenChange,
  onDone,
}: {
  target: RefundTarget;
  onOpenChange: (open: boolean) => void;
  onDone: (outcome: RefundOutcome) => void;
}) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const money = (minor: number) => formatMinor(format.number, minor, target.currency);
  const [amountText, setAmountText] = useState(formatMoneyInput(target.refundableMinor));
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One key per opened form (rule 07): a retried submit is the same refund.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amount = parseMoneyInput(amountText);
  const amountOk = amount !== null && amount <= target.refundableMinor;
  const reasonOk = moderationTextSchema.safeParse(reason).success;
  const length = [...reason].length;
  const max = money(target.refundableMinor);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (pending || amount === null || !amountOk || !reasonOk) return;
    setPending(true);
    setFailure(null);
    try {
      const refund = await refundPayment(
        target.paymentId,
        { amountMinor: amount, reason },
        idempotencyKey,
      );
      if (refund.status === 'FAILED') {
        setFailure(t('refund.refused'));
        return;
      }
      onDone(refund.status);
      onOpenChange(false);
    } catch (error) {
      setFailure(
        isOpsApiError(error, 'REFUND_EXCEEDS_PAID')
          ? t('refund.exceeds')
          : isOpsApiError(error, 'PAYMENT_PROVIDER_UNAVAILABLE')
            ? t('refund.unavailable')
            : t('actions.failed'),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogContent closeLabel={t('actions.close')}>
      <DialogHeader>
        <DialogTitle>{t('refund.title')}</DialogTitle>
        <DialogDescription>{t('refund.description')}</DialogDescription>
      </DialogHeader>
      <form noValidate className="grid gap-5" onSubmit={(event) => void submit(event)}>
        {failure === null ? null : <Alert variant="error">{failure}</Alert>}
        <Field
          id="ops-refund-amount"
          label={t('refund.amount')}
          description={t('refund.amountHelp', { max })}
          error={touched && !amountOk ? t('refund.amountError', { max }) : undefined}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums md:max-w-48"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          )}
        </Field>
        <p aria-live="polite" className="font-medium">
          {amountOk && amount !== null ? t('refund.willReturn', { amount: money(amount) }) : BLANK}
        </p>
        <Field
          id="ops-refund-reason"
          label={t('actions.reason')}
          description={
            <span className="type-data block text-right">
              {t('actions.counter', { count: length, max: MODERATION_TEXT_MAX_CHARS })}
            </span>
          }
          error={touched && !reasonOk ? t('actions.reasonRequired') : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" aria-disabled={pending || undefined}>
              {t('actions.cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" variant="destructive" aria-disabled={pending || undefined}>
            {pending
              ? t('refund.pending')
              : amountOk && amount !== null
                ? t('refund.confirmAmount', { amount: money(amount) })
                : t('refund.confirm')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
