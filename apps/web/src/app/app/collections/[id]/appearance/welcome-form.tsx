'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { codePointLength, type Collection, type CollectionDetail } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import { Textarea } from '@stepler/ui/components/textarea';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { isApiError } from '@/api/client';
import { collectionKey, updateCollection, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import {
  oneParagraph,
  toWelcomeRequest,
  WELCOME_COUNTER_FROM,
  WELCOME_MAX,
  type WelcomeFormValues,
  welcomeFormSchema,
} from './welcome-schema';

/**
 * «Привітання для гостей» (plan Task 10, [A5]): one short paragraph guests read above their
 * main action. A textarea that grows with its text (Enter saves: there are no line breaks; a
 * pasted text becomes one paragraph), a counter from 120 characters, «Зберегти» once changed
 * and valid, «Прибрати» when a message exists. Saved optimistically, like the title. Archived:
 * the text as it is, no form.
 */
export function WelcomeForm({
  collection,
  readOnly,
}: {
  collection: Collection;
  readOnly: boolean;
}) {
  const t = useTranslations('appearance.welcome');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const fieldId = useId();
  const counterId = useId();
  const saved = collection.welcomeMessage ?? '';

  const form = useForm<WelcomeFormValues>({
    resolver: zodResolver(welcomeFormSchema),
    defaultValues: { welcomeMessage: saved },
    mode: 'onChange',
  });
  const { isDirty, isValid, errors } = form.formState;
  const length = codePointLength(
    useWatch({ control: form.control, name: 'welcomeMessage' }).trim(),
  );

  // A save (here or elsewhere) changes the collection: the untouched form follows it.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset({ welcomeMessage: saved });
  }, [saved, form]);

  const save = useMutation({
    mutationFn: (values: WelcomeFormValues) =>
      updateCollection(collection.id, toWelcomeRequest(values)),
    onMutate: (values) => {
      const key = collectionKey(collection.id);
      const previous = queryClient.getQueryData<CollectionDetail>(key);
      if (previous !== undefined) {
        queryClient.setQueryData(key, { ...previous, ...toWelcomeRequest(values) });
      }
      return { previous };
    },
    onError: (error, _values, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKey(collection.id), context.previous);
      }
      toast({
        variant: 'error',
        title: t('failed'),
        description: tRoot(errorMessageKey(isApiError(error) ? error.code : 'INTERNAL')),
      });
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<CollectionDetail>(collectionKey(result.id), (previous) =>
        previous === undefined ? undefined : { ...previous, ...result },
      );
      form.reset({ welcomeMessage: result.welcomeMessage ?? '' });
      toast({ variant: 'success', title: t('saved') });
      await invalidate();
    },
  });

  if (readOnly) {
    return collection.welcomeMessage === null ? (
      <p className="text-muted-foreground">{t('none')}</p>
    ) : (
      <p className="max-w-[60ch] text-pretty [overflow-wrap:anywhere]">
        {collection.welcomeMessage}
      </p>
    );
  }

  const submit = form.handleSubmit((values) => {
    if (!save.isPending && form.formState.isDirty) save.mutate(values);
  });
  const over = length > WELCOME_MAX;
  const error = errors.welcomeMessage?.message;
  const counterClass = cn(
    'type-data justify-self-end text-[0.8125rem] tabular-nums',
    over ? 'text-destructive' : 'text-muted-foreground',
    length < WELCOME_COUNTER_FROM && 'sr-only',
  );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid max-w-2xl gap-4">
      <Field
        id={fieldId}
        label={t('label')}
        description={t('hint')}
        {...(error === undefined
          ? {}
          : { error: t(error === 'tooLong' ? 'tooLong' : 'lineBreaks', { max: WELCOME_MAX }) })}
      >
        {(control) => (
          <div className="grid gap-1.5">
            <Controller
              control={form.control}
              name="welcomeMessage"
              render={({ field }) => (
                <Textarea
                  {...control}
                  aria-describedby={cn(control['aria-describedby'], counterId)}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  rows={2}
                  placeholder={t('placeholder')}
                  className="min-h-20 text-[1.0625rem]"
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(oneParagraph(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
              )}
            />
            <p id={counterId} data-slot="welcome-counter" className={counterClass}>
              {t('counter', { count: length, max: WELCOME_MAX })}
            </p>
          </div>
        )}
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          aria-disabled={!isDirty || !isValid || save.isPending || undefined}
        >
          {save.isPending ? t('saving') : t('save')}
        </Button>
        {collection.welcomeMessage === null ? null : (
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            aria-disabled={save.isPending || undefined}
            onClick={() => {
              if (!save.isPending) save.mutate({ welcomeMessage: '' });
            }}
          >
            {t('clear')}
          </Button>
        )}
      </div>
    </form>
  );
}
