'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, signedInResponseSchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { PasswordInput } from '@stepler/ui/components/password-input';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { ME_QUERY_KEY } from '@/api/me';
import { FieldError } from '@/auth/field-error';
import { ResendVerification } from '@/auth/resend-verification';
import { signInErrorMessage } from '@/errors/error-message';
import { GoogleMark } from './google-mark';

const formSchema = z.object({
  email: loginRequestSchema.shape.email,
  password: z.string().min(1),
});
type LoginValues = z.infer<typeof formSchema>;

// The Ukrainian labels are wider than a 320–360px panel: the label wraps (the button grows).
const WRAPPING_BUTTON = 'h-auto min-h-12 py-2 whitespace-normal text-balance max-sm:px-4';
/** A full navigation to an API route: it redirects to Google and back. */
const GOOGLE_START = '/api/v1/auth/google/start';
const LINK = cn('rounded-sm text-link underline-offset-4 hover:underline', focusRing);

export type CallbackError =
  'OAUTH_FAILED' | 'ACCOUNT_BLOCKED' | 'LEGAL_ACCEPTANCE_REQUIRED' | 'LEGAL_VERSION_OUTDATED';

interface LoginFormProps {
  turnstileSiteKey: string;
  googleEnabled: boolean;
  /** An error code carried back from the Google callback or start (`/login?error=…`). */
  initialError: CallbackError | null;
  /** `LEGAL_CONTACT_EMAIL`, for a blocked account's message (slice 9); `null` when unset. */
  contactEmail: string | null;
}

/**
 * The sign-in card (ADR 0019): e-mail and password with show/hide, «Забули пароль?» beside the
 * password label, «Увійти», then «Увійти через Google» and the way to register. No legal
 * checkbox here: the registration form carries it, and an account without an acceptance meets
 * the fallback page after signing in (ADR 0016). A right password for an unconfirmed address
 * turns the card into «Підтвердіть пошту» with «Надіслати лист ще раз».
 */
export function LoginForm({
  turnstileSiteKey,
  googleEnabled,
  initialError,
  contactEmail,
}: LoginFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<LoginValues>({ resolver: zodResolver(formSchema), mode: 'onSubmit' });
  const login = useMutation({
    mutationFn: (values: LoginValues) =>
      apiRequest('/auth/login', { method: 'POST', body: values, schema: signedInResponseSchema }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.replace('/app');
    },
  });

  const code = isApiError(login.error) ? login.error.code : login.isError ? 'INTERNAL' : null;
  const unverifiedEmail = code === 'EMAIL_NOT_VERIFIED' ? form.getValues('email') : null;

  if (unverifiedEmail !== null) {
    return (
      <div className="grid gap-3">
        <h1 className="flex items-center gap-2.5 type-h2">
          <MailCheck aria-hidden="true" className="size-6 shrink-0 text-link" strokeWidth={1.75} />
          {t('login.unverifiedTitle')}
        </h1>
        <p className="text-muted-foreground">
          {t('login.unverifiedText', { email: unverifiedEmail })}
        </p>
        <ResendVerification email={unverifiedEmail} turnstileSiteKey={turnstileSiteKey} />
        <Button
          variant="ghost"
          className="-ml-3 justify-self-start text-link underline underline-offset-4"
          onClick={() => login.reset()}
        >
          {t('register.useAnother')}
        </Button>
      </div>
    );
  }

  const shownError = code ?? (login.isIdle ? initialError : null);
  const emailError = form.formState.errors.email;
  const passwordError = form.formState.errors.password;

  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-2 text-center sm:gap-3">
        <h1 className="type-h2">{t('login.title')}</h1>
        <p className="max-w-[40ch] text-pretty text-muted-foreground">{t('login.lead')}</p>
      </div>

      {shownError !== null && (
        <Alert variant="error">{signInErrorMessage(t, shownError, contactEmail)}</Alert>
      )}

      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => void form.handleSubmit((values) => login.mutate(values))(event)}
      >
        <div className="grid gap-2">
          <Label htmlFor="email">{t('login.emailLabel')}</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              spellCheck={false}
              placeholder={t('login.emailPlaceholder')}
              aria-invalid={emailError !== undefined}
              aria-describedby={emailError === undefined ? undefined : 'email-error'}
              disabled={login.isPending}
              className="pl-11"
              {...form.register('email')}
            />
          </div>
          {emailError !== undefined && (
            <FieldError id="email-error" message={t('login.emailInvalid')} />
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">{t('login.passwordLabel')}</Label>
            <Link href="/forgot-password" className={cn('text-sm', LINK)}>
              {t('login.forgot')}
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            showLabel={t('login.showPassword')}
            hideLabel={t('login.hidePassword')}
            aria-invalid={passwordError !== undefined}
            aria-describedby={passwordError === undefined ? undefined : 'password-error'}
            disabled={login.isPending}
            {...form.register('password')}
          />
          {passwordError !== undefined && (
            <FieldError id="password-error" message={t('login.passwordRequired')} />
          )}
        </div>

        <Button type="submit" size="lg" className={WRAPPING_BUTTON} disabled={login.isPending}>
          {login.isPending ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            {t('login.or')}
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <Button asChild variant="outline" size="lg" className={WRAPPING_BUTTON}>
            <a href={GOOGLE_START}>
              <GoogleMark className="size-[18px]" />
              {t('login.google')}
            </a>
          </Button>
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/register" className={cn('font-medium', LINK)}>
          {t('login.registerLink')}
        </Link>
      </p>
    </div>
  );
}
