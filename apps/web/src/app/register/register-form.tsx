'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  authEmailSentResponseSchema,
  emailAddressSchema,
  type LegalVersions,
} from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { FieldError } from '@/auth/field-error';
import { NewPasswordFields } from '@/auth/new-password-fields';
import { checkConfirm, NEW_PASSWORD_FIELDS, PASSWORD_WEAK } from '@/auth/password-form-schema';
import { ResendVerification } from '@/auth/resend-verification';
import type { TurnstileHandle } from '@/auth/turnstile';
import { TurnstileField } from '@/auth/turnstile-field';
import { errorMessageKey } from '@/errors/error-message';
import { isLocale } from '@/i18n/locales';
import { LegalConsent } from '@/legal/legal-consent';
import { GoogleMark } from '../login/google-mark';

const formSchema = z
  .object({ email: emailAddressSchema, ...NEW_PASSWORD_FIELDS })
  .superRefine(checkConfirm);
type RegisterValues = z.infer<typeof formSchema>;

const WRAPPING_BUTTON = 'h-auto min-h-12 py-2 whitespace-normal text-balance max-sm:px-4';
const LINK = cn('rounded-sm font-medium text-link underline-offset-4 hover:underline', focusRing);
/** The reason the disabled buttons give (ADR 0016), shown while the box is unticked. */
const LEGAL_HINT_ID = 'legal-hint';

/**
 * Registration (owner 2026-10-16, ADR 0019): e-mail, the password with its meter, «Підтвердіть
 * пароль» with the match line, Turnstile, the required legal checkbox (ADR 0016: both buttons
 * stay disabled until it is ticked), «Створити акаунт», then «Зареєструватися через Google» (it
 * carries the accepted versions). After the request: «Перевірте пошту» with the address and
 * «Надіслати лист ще раз». The API answers the same for a taken address (its owner gets a notice).
 */
export function RegisterForm({
  turnstileSiteKey,
  googleEnabled,
  legal,
}: {
  turnstileSiteKey: string;
  googleEnabled: boolean;
  legal: LegalVersions;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [legalAccepted, setLegalAccepted] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onToken = useCallback((token: string | null) => setTurnstileToken(token), []);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '', confirm: '' },
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const confirm = useWatch({ control: form.control, name: 'confirm' });

  const register = useMutation({
    mutationFn: ({ email, password: chosen }: RegisterValues) =>
      apiRequest('/auth/register', {
        method: 'POST',
        body: {
          email,
          password: chosen,
          turnstileToken: turnstileToken ?? '',
          ...(isLocale(locale) ? { locale } : {}),
          legal,
        },
        schema: authEmailSentResponseSchema,
      }),
    onSuccess: (_data, values) => setSentTo(values.email),
    onError: (error) => {
      // The documents changed while the form was open: fetch the new versions, ask again.
      if (!isApiError(error, 'LEGAL_VERSION_OUTDATED')) return;
      setLegalAccepted(false);
      router.refresh();
    },
    onSettled: () => turnstile.current?.reset(),
  });

  if (sentTo !== null) {
    return (
      <div className="grid gap-3">
        <h1 className="flex items-center gap-2.5 type-h2">
          <MailCheck
            aria-hidden="true"
            className="size-6 shrink-0 text-success"
            strokeWidth={1.75}
          />
          {t('register.sentTitle')}
        </h1>
        <p role="status">{t('register.sentText', { email: sentTo })}</p>
        <p className="text-sm text-muted-foreground">{t('register.sentHint')}</p>
        <ResendVerification email={sentTo} turnstileSiteKey={turnstileSiteKey} />
        <Button
          variant="ghost"
          className="-ml-3 justify-self-start text-link underline underline-offset-4"
          onClick={() => {
            setSentTo(null);
            register.reset();
          }}
        >
          {t('register.useAnother')}
        </Button>
      </div>
    );
  }

  const { errors } = form.formState;
  const requestError = isApiError(register.error)
    ? register.error.code
    : register.isError
      ? 'INTERNAL'
      : null;
  const pending = register.isPending;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2 text-center">
        <h1 className="type-h2">{t('register.title')}</h1>
        <p className="text-pretty text-muted-foreground">{t('register.lead')}</p>
      </div>
      {requestError !== null && <Alert variant="error">{t(errorMessageKey(requestError))}</Alert>}
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void form.handleSubmit((values) => register.mutate(values))(event)}
      >
        <div className="grid gap-2">
          <Label htmlFor="register-email">{t('login.emailLabel')}</Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="register-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder={t('login.emailPlaceholder')}
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email === undefined ? undefined : 'register-email-error'}
              disabled={pending}
              className="pl-11"
              {...form.register('email')}
            />
          </div>
          {errors.email !== undefined && (
            <FieldError id="register-email-error" message={t('login.emailInvalid')} />
          )}
        </div>
        <NewPasswordFields
          idPrefix="register"
          passwordLabel={t('register.passwordLabel')}
          confirmLabel={t('register.confirmLabel')}
          password={password}
          confirm={confirm}
          passwordField={form.register('password')}
          confirmField={form.register('confirm')}
          passwordError={
            // While typing, the meter says what is missing; the error joins it on submit.
            errors.password === undefined || !form.formState.isSubmitted ? null : t(PASSWORD_WEAK)
          }
          confirmError={errors.confirm?.message === undefined ? null : t(errors.confirm.message)}
          disabled={pending}
        />
        <TurnstileField
          turnstileRef={turnstile}
          siteKey={turnstileSiteKey}
          locale={locale}
          onToken={onToken}
        />
        <div className="grid gap-1">
          <LegalConsent
            id="legal-accept"
            messageKey="login.legalCheckbox"
            checked={legalAccepted}
            onCheckedChange={setLegalAccepted}
            disabled={pending}
          />
          {!legalAccepted && (
            <p id={LEGAL_HINT_ID} className="pl-8 type-small text-muted-foreground">
              {t('login.legalHint')}
            </p>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          className={WRAPPING_BUTTON}
          disabled={pending || turnstileToken === null || !legalAccepted}
          aria-describedby={legalAccepted ? undefined : LEGAL_HINT_ID}
        >
          {pending
            ? t('register.sending')
            : turnstileToken === null
              ? t('login.turnstilePending')
              : t('register.submit')}
        </Button>
      </form>
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            {t('login.or')}
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          {legalAccepted ? (
            <Button asChild variant="outline" size="lg" className={WRAPPING_BUTTON}>
              <a href={googleStartHref(legal)}>
                <GoogleMark className="size-[18px]" />
                {t('register.google')}
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={WRAPPING_BUTTON}
              disabled
              aria-describedby={LEGAL_HINT_ID}
            >
              <GoogleMark className="size-[18px] opacity-60" />
              {t('register.google')}
            </Button>
          )}
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className={LINK}>
          {t('register.loginLink')}
        </Link>
      </p>
    </div>
  );
}

function googleStartHref(legal: LegalVersions): string {
  const query = new URLSearchParams({ terms: legal.terms, privacy: legal.privacy });
  return `/api/v1/auth/google/start?${query.toString()}`;
}
