'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Label } from '@stepler/ui/components/label';
import { PasswordInput } from '@stepler/ui/components/password-input';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { FieldError } from '@/auth/field-error';
import { NewPasswordFields } from '@/auth/new-password-fields';
import { checkConfirm, NEW_PASSWORD_FIELDS, PASSWORD_WEAK } from '@/auth/password-form-schema';
import { errorMessageKey } from '@/errors/error-message';

const formSchema = z
  .object({ currentPassword: z.string().min(1), ...NEW_PASSWORD_FIELDS })
  .superRefine(checkConfirm);
type PasswordValues = z.infer<typeof formSchema>;

/**
 * «Пароль» (ADR 0019): the current password, then the new one twice with the meter; «Змінити
 * пароль» ends every other session and keeps this one. An account without a password (from
 * Google) sets its first through the e-mailed link instead, so a stolen session cannot add one.
 */
export function PasswordForm() {
  const t = useTranslations();
  const { toast } = useToast();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const form = useForm<PasswordValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', password: '', confirm: '' },
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const confirm = useWatch({ control: form.control, name: 'confirm' });
  const change = useMutation({
    mutationFn: (values: PasswordValues) =>
      apiRequest('/auth/password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.password },
      }),
    onSuccess: () => {
      form.reset();
      toast({ variant: 'success', title: t('accountPassword.saved') });
    },
  });

  if (me.data === undefined) return null;
  if (!me.data.hasPassword) {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="max-w-[60ch] text-pretty">{t('accountPassword.noPassword')}</p>
        <Button asChild variant="outline">
          <Link href="/forgot-password">{t('accountPassword.setLink')}</Link>
        </Button>
      </div>
    );
  }

  const { errors } = form.formState;
  const code = isApiError(change.error) ? change.error.code : change.isError ? 'INTERNAL' : null;
  return (
    <form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => void form.handleSubmit((values) => change.mutate(values))(event)}
    >
      {code !== null && <Alert variant="error">{t(errorMessageKey(code))}</Alert>}
      <div className="grid gap-2">
        <Label htmlFor="account-current-password">{t('accountPassword.current')}</Label>
        <PasswordInput
          id="account-current-password"
          autoComplete="current-password"
          showLabel={t('login.showPassword')}
          hideLabel={t('login.hidePassword')}
          aria-invalid={errors.currentPassword !== undefined}
          aria-describedby={
            errors.currentPassword === undefined ? undefined : 'account-current-password-error'
          }
          disabled={change.isPending}
          {...form.register('currentPassword')}
        />
        {errors.currentPassword !== undefined && (
          <FieldError id="account-current-password-error" message={t('login.passwordRequired')} />
        )}
      </div>
      <NewPasswordFields
        idPrefix="account"
        passwordLabel={t('accountPassword.new')}
        confirmLabel={t('accountPassword.confirm')}
        password={password}
        confirm={confirm}
        passwordField={form.register('password')}
        confirmField={form.register('confirm')}
        passwordError={
          // While typing, the meter says what is missing; the error joins it on submit.
          errors.password === undefined || !form.formState.isSubmitted ? null : t(PASSWORD_WEAK)
        }
        confirmError={errors.confirm?.message === undefined ? null : t(errors.confirm.message)}
        disabled={change.isPending}
      />
      <Button type="submit" className="justify-self-start" disabled={change.isPending}>
        {change.isPending ? t('accountPassword.saving') : t('accountPassword.submit')}
      </Button>
    </form>
  );
}
