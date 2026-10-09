'use client';

// Design pass (billing M2, Task 14; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The hand-off to LiqPay, the one moment the owner leaves Stepler:
// - after the server has priced the checkout, the whole window turns into the brand loading
//   screen with one sentence «Переходимо на сторінку оплати LiqPay…» and a second that says how
//   they come back, so a slow bank page never looks like a frozen button;
// - the browser then posts LiqPay's signed form (`data` + `signature`) in the same tab (no popup,
//   which phones block); nothing else is sent and no amount comes from the client (ADR 0018);
// - under reduced motion the loading line stands still; the overlay keeps the page's colours.
import type { CheckoutRequest, CheckoutResponse } from '@stepler/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isApiError } from '@/api/client';
import { createCheckout, resumeCheckout, resumeSubscription } from '@/api/billing';
import { BrandLoading } from '@/components/brand-loading';
import { errorMessageKey } from '@/errors/error-message';

type CheckoutForm = NonNullable<CheckoutResponse['form']>;

/** The full-window hand-off; posts the signed form as soon as it is on the page. */
export function CheckoutHandoff({ form }: { form: CheckoutForm }) {
  const t = useTranslations('billing.handoff');
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.submit();
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-background p-6">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <BrandLoading label={t('title')} />
        <p className="type-h2 text-balance">{t('title')}</p>
        <p className="text-sm text-pretty text-muted-foreground">{t('text')}</p>
      </div>
      <form ref={ref} method="post" action={form.action} acceptCharset="utf-8" hidden>
        <input type="hidden" name="data" value={form.fields.data} />
        <input type="hidden" name="signature" value={form.fields.signature} />
      </form>
    </div>,
    document.body,
  );
}

/** What a checkout starts from: a request, the same pending order again, or a cancelled plan. */
export type CheckoutStart =
  CheckoutRequest | { resume: string } | { resumeSubscription: { termsVersion: string } };

/**
 * Starts a checkout: the API prices it and returns LiqPay's form, which the hand-off posts;
 * `{ resume }` asks for the same pending order again (after a declined card), and
 * `{ resumeSubscription }` a cancelled plan again. Nothing to pay (`form: null`) goes to the
 * return page, or, for a plan change that needed no payment (applied or scheduled, no payment
 * id), to `onSettled`. `errorMessage` is the translated reason of the last failure.
 */
export function useCheckout(onSettled?: (response: CheckoutResponse) => void): {
  start: (request: CheckoutStart) => Promise<void>;
  pending: boolean;
  errorMessage: string | null;
  reset: () => void;
  handoff: ReactNode;
} {
  const tRoot = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState<CheckoutForm | null>(null);
  const mutation = useMutation({
    mutationFn: (request: CheckoutStart) =>
      'resume' in request
        ? resumeCheckout(request.resume)
        : 'resumeSubscription' in request
          ? resumeSubscription(request.resumeSubscription.termsVersion)
          : createCheckout(request),
    onSuccess: (res) => {
      if (res.form !== null) setForm(res.form);
      else if (res.paymentId !== null) router.push(`/app/billing/return?payment=${res.paymentId}`);
      else onSettled?.(res);
    },
  });
  const error = mutation.error;
  return {
    start: async (request) => {
      await mutation.mutateAsync(request);
    },
    pending: mutation.isPending || form !== null,
    errorMessage:
      error === null
        ? null
        : tRoot(errorMessageKey(isApiError(error) ? error.code : 'UPSTREAM_UNAVAILABLE')),
    reset: mutation.reset,
    handoff: form === null ? null : <CheckoutHandoff form={form} />,
  };
}
