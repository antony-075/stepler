'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { meResponseSchema, NO_CONTROL_CHARACTERS, type UpdateMeRequest } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { useLeaveGuard } from '@/components/use-leave-guard';
import { errorMessageKey } from '@/errors/error-message';

export const NAME_MAX = 80;

/** The field as typed; blank clears the name (`null`). The API checks it again. */
const formSchema = z.object({
  displayName: z.string().trim().max(NAME_MAX).regex(NO_CONTROL_CHARACTERS),
});
type ProfileValues = z.infer<typeof formSchema>;

export const toUpdateRequest = (values: ProfileValues): UpdateMeRequest => ({
  displayName: values.displayName.trim() === '' ? null : values.displayName.trim(),
});

/**
 * «Ім’я»: the name shown in the top bar (and, later, to guests). Saved explicitly: Cancel and
 * Save are `aria-disabled` until something changed, leaving with unsaved changes asks first, a
 * save confirms with a toast and the header follows at once (the `me` cache is updated).
 */
export function ProfileForm() {
  const t = useTranslations('account.profile');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const current = me.data?.displayName ?? '';
  const saved = useMemo(() => ({ displayName: current }), [current]);
  const form = useForm<ProfileValues>({ resolver: zodResolver(formSchema), values: saved });
  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiRequest('/me', {
        method: 'PATCH',
        body: toUpdateRequest(values),
        schema: meResponseSchema,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(ME_QUERY_KEY, next);
      form.reset({ displayName: next.displayName ?? '' });
      toast({ variant: 'success', title: t('saved') });
    },
  });
  const dirty = form.formState.isDirty;
  const inert = !dirty || save.isPending;
  useLeaveGuard(dirty, t('leave'));
  const error = form.formState.errors.displayName;
  const length = useWatch({ control: form.control, name: 'displayName' }).length;
  const failure = isApiError(save.error) ? save.error.code : null;

  return (
    <form
      noValidate
      aria-label={t('formLabel')}
      className="grid max-w-xl gap-4"
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          if (!save.isPending) save.mutate(values);
        })(event)
      }
    >
      <Field
        id="account-name"
        label={t('name')}
        description={
          <span className="flex justify-between gap-4">
            <span>{t('nameHint')}</span>
            <span className="type-data shrink-0">
              {t('counter', { count: length, max: NAME_MAX })}
            </span>
          </span>
        }
        error={
          error === undefined
            ? undefined
            : error.type === 'too_big'
              ? t('tooLong', { max: NAME_MAX })
              : t('invalid')
        }
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="name"
            maxLength={NAME_MAX}
            placeholder={t('placeholder')}
            {...form.register('displayName')}
          />
        )}
      </Field>
      {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          aria-disabled={inert || undefined}
          onClick={() => {
            if (inert) return;
            form.reset(saved);
            save.reset();
          }}
        >
          {t('cancel')}
        </Button>
        <Button type="submit" aria-disabled={inert || undefined}>
          {save.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
