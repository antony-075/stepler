'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  authEmailSentResponseSchema,
  emailAddressSchema,
  type ErrorCode,
} from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { FieldError } from '@/auth/field-error';
import type { TurnstileHandle } from '@/auth/turnstile';
import { TurnstileField } from '@/auth/turnstile-field';
import { errorMessageKey } from '@/errors/error-message';

const errorCode = (error: unknown): ErrorCode => (isApiError(error) ? error.code : 'INTERNAL');
import { isLocale } from '@/i18n/locales';

const formSchema = z.object({ email: emailAddressSchema });
type ForgotValues = z.infer<typeof formSchema>;

/** The address, Turnstile, «Надіслати посилання»; then the same «Перевірте пошту» for anyone. */
export function ForgotForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const turnstile = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((next: string | null) => setToken(next), []);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotValues>({ resolver: zodResolver(formSchema) });
  const send = useMutation({
    mutationFn: ({ email }: ForgotValues) =>
      apiRequest('/auth/password/forgot', {
        method: 'POST',
        body: { email, turnstileToken: token ?? '', ...(isLocale(locale) ? { locale } : {}) },
        schema: authEmailSentResponseSchema,
      }),
    onSuccess: (_data, values) => setSentTo(values.email),
    onSettled: () => turnstile.current?.reset(),
  });

  const back = (
    <Button asChild variant="ghost" className="justify-self-center text-link">
      <Link href="/login">{t('forgot.back')}</Link>
    </Button>
  );

  if (sentTo !== null) {
    return (
      <div className="grid gap-3">
        <h1 className="flex items-center gap-2.5 type-h2">
          <MailCheck
            aria-hidden="true"
            className="size-6 shrink-0 text-success"
            strokeWidth={1.75}
          />
          {t('forgot.sentTitle')}
        </h1>
        <p role="status">{t('forgot.sentText', { email: sentTo })}</p>
        {back}
      </div>
    );
  }

  const emailError = form.formState.errors.email;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="type-h2">{t('forgot.title')}</h1>
        <p className="text-pretty text-muted-foreground">{t('forgot.lead')}</p>
      </div>
      {send.isError && <Alert variant="error">{t(errorMessageKey(errorCode(send.error)))}</Alert>}
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => void form.handleSubmit((values) => send.mutate(values))(event)}
      >
        <div className="grid gap-2">
          <Label htmlFor="forgot-email">{t('login.emailLabel')}</Label>
          <Input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder={t('login.emailPlaceholder')}
            aria-invalid={emailError !== undefined}
            aria-describedby={emailError === undefined ? undefined : 'forgot-email-error'}
            disabled={send.isPending}
            {...form.register('email')}
          />
          {emailError !== undefined && (
            <FieldError id="forgot-email-error" message={t('login.emailInvalid')} />
          )}
        </div>
        <TurnstileField
          turnstileRef={turnstile}
          siteKey={turnstileSiteKey}
          locale={locale}
          onToken={onToken}
        />
        <Button type="submit" size="lg" disabled={send.isPending || token === null}>
          {send.isPending
            ? t('forgot.sending')
            : token === null
              ? t('login.turnstilePending')
              : t('forgot.submit')}
        </Button>
      </form>
      {back}
    </div>
  );
}
