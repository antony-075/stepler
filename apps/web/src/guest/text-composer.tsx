'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TEXT_MAX_CHARS, codePointLength, textBodySchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { Textarea } from '@stepler/ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { isApiError } from '@/api/client';
import { z } from 'zod';

/** The counter appears near the limit, not from the first letter. */
const COUNTER_FROM = 4500;

const formSchema = z.object({ body: z.string() });
type TextValues = z.infer<typeof formSchema>;

type TextError = 'empty' | 'tooLong' | 'invalid';

function textError(value: string): TextError | null {
  if (value.trim() === '') return 'empty';
  if (codePointLength(value.trim()) > TEXT_MAX_CHARS) return 'tooLong';
  return textBodySchema.safeParse(value).success ? null : 'invalid';
}

/**
 * A wish (D5, [O2]): plain text up to 5000 characters in a bottom sheet (a centred dialog from
 * 640px). One `Idempotency-Key` per draft text, kept across retries until the wish is sent, so a
 * retry after a lost answer never adds it twice. The draft survives closing the sheet. «Надіслати» is
 * the pencil action; a failure stays in the sheet with the text kept.
 */
export function TextComposer({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves when the wish is stored; rejects with the API error otherwise. */
  onSend: (body: string, idempotencyKey: string) => Promise<void>;
}) {
  const t = useTranslations('guest.composer');
  const form = useForm<TextValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { body: '' },
  });
  // The key belongs to one text: an edited draft is a new wish and gets a new key.
  const key = useRef<{ value: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const body = useWatch({ control: form.control, name: 'body' });
  const length = codePointLength(body.trim());
  const error = form.formState.errors.body;

  async function send({ body: value }: TextValues) {
    if (sending) return;
    const problem = textError(value);
    if (problem !== null) {
      form.setError('body', { type: problem });
      return;
    }
    const text = value.trim();
    if (key.current?.body !== text) key.current = { value: crypto.randomUUID(), body: text };
    setSending(true);
    setFailed(false);
    try {
      await onSend(text, key.current.value);
      key.current = null;
      form.reset({ body: '' });
      onOpenChange(false);
    } catch (error) {
      // Stored, then deleted by the organiser before the answer arrived: a new send is a new wish.
      if (isApiError(error, 'CONTENT_NOT_FOUND')) key.current = null;
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader closeLabel={t('close')} className="bg-popover">
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-4 sm:p-6">
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) => void form.handleSubmit(send)(event)}
          >
            <Field
              id="guest-wish"
              label={t('label')}
              description={
                length >= COUNTER_FROM ? (
                  <span className="flex justify-end">
                    <span
                      className={
                        length > TEXT_MAX_CHARS ? 'type-data text-destructive' : 'type-data'
                      }
                    >
                      {t('counter', { count: length, max: TEXT_MAX_CHARS })}
                    </span>
                  </span>
                ) : undefined
              }
              error={
                error === undefined
                  ? undefined
                  : error.type === 'tooLong'
                    ? t('tooLong', { max: TEXT_MAX_CHARS })
                    : error.type === 'invalid'
                      ? t('invalid')
                      : t('empty')
              }
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={4}
                  className="min-h-32 [overflow-wrap:anywhere]"
                  {...form.register('body')}
                />
              )}
            </Field>
            {failed ? <Alert variant="error">{t('failed')}</Alert> : null}
            <Button
              type="submit"
              variant="pencil"
              size="lg"
              aria-disabled={sending || undefined}
              className="sm:justify-self-end"
            >
              {sending ? t('sending') : t('send')}
            </Button>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
