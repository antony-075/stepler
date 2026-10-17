'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signedInResponseSchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { ME_QUERY_KEY } from '@/api/me';
import { NewPasswordFields } from '@/auth/new-password-fields';
import { checkConfirm, NEW_PASSWORD_FIELDS, PASSWORD_WEAK } from '@/auth/password-form-schema';
import { signInErrorMessage } from '@/errors/error-message';

const formSchema = z.object(NEW_PASSWORD_FIELDS).superRefine(checkConfirm);
type ResetValues = z.infer<typeof formSchema>;

/**
 * A new password from the e-mailed link (ADR 0019): typed twice with the meter, then «Зберегти й
 * увійти», which ends every other session and signs this browser in. A link that is unknown,
 * used or expired (also found out only on submit) offers a new one.
 */
export function ResetForm({
  token,
  contactEmail,
}: {
  token: string | null;
  contactEmail: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<ResetValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const confirm = useWatch({ control: form.control, name: 'confirm' });
  const reset = useMutation({
    mutationFn: (values: ResetValues) =>
      apiRequest('/auth/password/reset', {
        method: 'POST',
        body: { token, password: values.password },
        schema: signedInResponseSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.replace('/app');
    },
  });

  const code = isApiError(reset.error) ? reset.error.code : reset.isError ? 'INTERNAL' : null;
  if (token === null || code === 'AUTH_TOKEN_INVALID') {
    return (
      <div className="grid gap-4">
        <h1 className="type-h2">{t('reset.invalidTitle')}</h1>
        <p role="alert" className="text-muted-foreground">
          {t('errors.AUTH_TOKEN_INVALID')}
        </p>
        <Button asChild size="lg">
          <Link href="/forgot-password">{t('reset.newLink')}</Link>
        </Button>
      </div>
    );
  }

  const { errors } = form.formState;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="type-h2">{t('reset.title')}</h1>
        <p className="text-pretty text-muted-foreground">{t('reset.lead')}</p>
      </div>
      {code !== null && <Alert variant="error">{signInErrorMessage(t, code, contactEmail)}</Alert>}
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void form.handleSubmit((values) => reset.mutate(values))(event)}
      >
        <NewPasswordFields
          idPrefix="reset"
          passwordLabel={t('reset.passwordLabel')}
          confirmLabel={t('reset.confirmLabel')}
          password={password}
          confirm={confirm}
          passwordField={form.register('password')}
          confirmField={form.register('confirm')}
          passwordError={
            // While typing, the meter says what is missing; the error joins it on submit.
            errors.password === undefined || !form.formState.isSubmitted ? null : t(PASSWORD_WEAK)
          }
          confirmError={errors.confirm?.message === undefined ? null : t(errors.confirm.message)}
          disabled={reset.isPending}
        />
        <Button type="submit" size="lg" disabled={reset.isPending}>
          {reset.isPending ? t('reset.saving') : t('reset.submit')}
        </Button>
      </form>
    </div>
  );
}
