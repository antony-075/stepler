'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { Textarea } from '@stepler/ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DESTRUCTIVE, type OpsAction } from './actions';

const COUNTER = 'type-data block text-right';
const COUNTER_OVER = 'type-data block text-right text-destructive';
const DESTRUCTIVE_BUTTON = 'destructive';
const DEFAULT_BUTTON = 'default';

const formSchema = z.object({ reason: moderationTextSchema });
type FormValues = z.infer<typeof formSchema>;

/**
 * Every operator action asks for a reason (R5): one required field with a code-point counter,
 * validated by the contract's own schema. The error of a failed call stays in the dialog; it
 * closes only on success (the caller then toasts). The confirm button is destructive for delete
 * and block.
 */
export function ReasonDialog({
  action,
  onOpenChange,
  onConfirm,
}: {
  /** The action being confirmed; `null` keeps the dialog closed. */
  action: OpsAction | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves when done; a thrown message is shown in the dialog. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const t = useTranslations('ops.actions');
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reason: '' },
  });
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const length = [...useWatch({ control: form.control, name: 'reason' })].length;
  const error = form.formState.errors.reason;
  const over = length > MODERATION_TEXT_MAX_CHARS;
  const counterClass = over ? COUNTER_OVER : COUNTER;
  const confirmVariant =
    action !== null && DESTRUCTIVE.has(action) ? DESTRUCTIVE_BUTTON : DEFAULT_BUTTON;

  const changeOpen = (open: boolean) => {
    if (!open && pending) return;
    if (!open) {
      form.reset({ reason: '' });
      setFailure(null);
    }
    onOpenChange(open);
  };

  const submit = form.handleSubmit(async ({ reason }) => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      await onConfirm(reason);
      form.reset({ reason: '' });
      onOpenChange(false);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : t('failed'));
    } finally {
      setPending(false);
    }
  });

  return (
    <Dialog open={action !== null} onOpenChange={changeOpen}>
      <DialogContent closeLabel={t('close')}>
        {action === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>{t(`${action}.title`)}</DialogTitle>
              <DialogDescription>{t(`${action}.description`)}</DialogDescription>
            </DialogHeader>
            <form noValidate className="grid gap-5" onSubmit={(event) => void submit(event)}>
              {failure === null ? null : <Alert variant="error">{failure}</Alert>}
              <Field
                id="ops-reason"
                label={t('reason')}
                description={
                  <span className={counterClass}>
                    {t('counter', { count: length, max: MODERATION_TEXT_MAX_CHARS })}
                  </span>
                }
                error={
                  error === undefined
                    ? undefined
                    : length > MODERATION_TEXT_MAX_CHARS
                      ? t('reasonTooLong', { max: MODERATION_TEXT_MAX_CHARS })
                      : t('reasonRequired')
                }
              >
                {(control) => <Textarea {...control} rows={3} {...form.register('reason')} />}
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" aria-disabled={pending || undefined}>
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button type="submit" variant={confirmVariant} aria-disabled={pending || undefined}>
                  {pending ? t('pending') : t(`${action}.confirm`)}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
