'use client';

// Design pass (billing M2, Task 14; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). Buying a pack is a paying action, so it is a dialog that is its own
// confirmation (plan "Web": paying actions confirm): what the pack is in one sentence, which
// collection it is for, the amount, and one primary button that names what happens next
// («Перейти до оплати»). Choices are full-row radios (44px), the collection's title is the label;
// «Нова колекція» reveals the title field, focused, with the rule that it is created after
// payment. Errors (pending payment, offer gone, payments off) appear inside the dialog, which
// stays open. On phones the footer buttons stack full width (DialogFooter).
import { zodResolver } from '@hookform/resolvers/zod';
import { collectionTitleSchema } from '@stepler/contracts';
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
import { RadioGroup, RadioGroupItem } from '@stepler/ui/components/radio-group';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Spinner } from '@stepler/ui/components/spinner';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { collectionsPageKey, listCollections } from '@/api/collections';
import { useCheckout } from './checkout-redirect';
import { formatMoney, type PricedOffer } from './offers';

const NEW = 'new';

const formSchema = z
  .object({ target: z.string().min(1), title: z.string() })
  .superRefine((value, ctx) => {
    if (value.target !== NEW) return;
    if (!collectionTitleSchema.safeParse(value.title.trim()).success) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'title' });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export function BuyPackDialog({
  pack,
  open,
  onOpenChange,
  initialCollectionId,
}: {
  pack: PricedOffer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCollectionId?: string | undefined;
}) {
  const t = useTranslations('billing.buy');
  const tCollections = useTranslations('collections');
  const format = useFormatter();
  const legendId = useId();
  const checkout = useCheckout();
  // Packs are bought for the account's own (not yet packed) active collections, or a new one.
  const collections = useQuery({
    queryKey: collectionsPageKey('ACTIVE'),
    queryFn: () => listCollections('ACTIVE'),
    enabled: open,
  });
  const eligible = (collections.data?.items ?? []).filter(
    (item) => item.entitlement === 'ACCOUNT' && item.blocked === null,
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { target: '', title: '' },
  });
  const target = useWatch({ control: form.control, name: 'target' });

  // The first sensible choice once the list is known: the asked-for collection, else the first.
  useEffect(() => {
    if (!open || collections.data === undefined || form.getValues('target') !== '') return;
    const preferred = eligible.find((item) => item.id === initialCollectionId) ?? eligible[0];
    form.setValue('target', preferred?.id ?? NEW);
  }, [open, collections.data, eligible, initialCollectionId, form]);

  // «Нова колекція» chosen: its title is the next thing to type.
  useEffect(() => {
    if (target === NEW) form.setFocus('title');
  }, [target, form]);

  const submit = form.handleSubmit(async (values) => {
    await checkout
      .start(
        values.target === NEW
          ? { kind: 'PACK', priceId: pack.priceId, collectionId: null, title: values.title.trim() }
          : { kind: 'PACK', priceId: pack.priceId, collectionId: values.target },
      )
      .catch(() => undefined);
  });

  const titleError =
    form.formState.errors.title === undefined ? undefined : tCollections('form.titleRequired');

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (checkout.pending) return;
          if (!next) {
            form.reset();
            checkout.reset();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent closeLabel={t('cancel')}>
          <DialogHeader>
            <DialogTitle>{t('title', { title: pack.offer.title })}</DialogTitle>
            <DialogDescription>
              {t('description', { days: pack.offer.limits.windowDays ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <form noValidate className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <fieldset className="grid gap-1" aria-labelledby={legendId}>
              <legend id={legendId} className="mb-1 text-sm font-medium">
                {t('target')}
              </legend>
              {collections.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <Controller
                  control={form.control}
                  name="target"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-labelledby={legendId}
                    >
                      {eligible.map((item) => (
                        <RadioGroupItem key={item.id} value={item.id}>
                          <span className="min-w-0 truncate">{item.title}</span>
                        </RadioGroupItem>
                      ))}
                      <RadioGroupItem value={NEW}>{t('newCollection')}</RadioGroupItem>
                    </RadioGroup>
                  )}
                />
              )}
              {collections.isSuccess && eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noExisting')}</p>
              ) : null}
            </fieldset>
            {target === NEW ? (
              <Field
                id="buy-pack-title"
                label={t('newTitle')}
                description={t('newTitleHint')}
                error={titleError}
              >
                {(control) => <Input {...control} {...form.register('title')} maxLength={100} />}
              </Field>
            ) : null}
            <p className="flex items-baseline justify-between gap-4 border-t pt-4">
              <span className="text-foreground-soft">{t('total')}</span>
              <span className="text-xl font-semibold tabular-nums">
                {formatMoney(format.number, pack.price)}
              </span>
            </p>
            <p className="text-sm text-pretty text-muted-foreground">{t('liqpayNote')}</p>
            {checkout.errorMessage === null ? null : (
              <Alert variant="error">{checkout.errorMessage}</Alert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={checkout.pending}>
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                aria-disabled={checkout.pending || target === ''}
                onClick={(event) => {
                  if (checkout.pending || target === '') event.preventDefault();
                }}
              >
                {checkout.pending ? <Spinner label={t('paying')} /> : null}
                {t('pay')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {checkout.handoff}
    </>
  );
}
