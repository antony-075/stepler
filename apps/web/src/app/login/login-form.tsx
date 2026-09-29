'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { magicLinkRequestSchema } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { errorMessageKey } from '@/errors/error-message';
import { isLocale } from '@/i18n/locales';
import { Turnstile, type TurnstileHandle } from './turnstile';

const emailFormSchema = magicLinkRequestSchema.pick({ email: true });
type EmailForm = z.infer<typeof emailFormSchema>;

interface LoginFormProps {
  turnstileSiteKey: string;
  googleEnabled: boolean;
  /** An error code carried back from the Google callback (`/login?error=…`). */
  initialError: 'OAUTH_FAILED' | 'ACCOUNT_BLOCKED' | null;
}

export function LoginForm({ turnstileSiteKey, googleEnabled, initialError }: LoginFormProps) {
  const t = useTranslations();
  const locale = useLocale();
  const turnstile = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const onToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const form = useForm<EmailForm>({ resolver: zodResolver(emailFormSchema), mode: 'onSubmit' });
  const request = useMutation({
    mutationFn: (email: string) =>
      apiRequest('/auth/magic-link', {
        method: 'POST',
        body: {
          email,
          turnstileToken: turnstileToken ?? '',
          ...(isLocale(locale) ? { locale } : {}),
        },
      }),
    onSuccess: (_data, email) => setSentTo(email),
    onSettled: () => turnstile.current?.reset(),
  });

  if (sentTo !== null) {
    return (
      <div role="status" className="grid gap-3">
        <h2 className="text-xl font-semibold">{t('login.sentTitle')}</h2>
        <p className="text-muted-foreground">{t('login.sentText', { email: sentTo })}</p>
        <p className="text-muted-foreground">{t('login.sentHint')}</p>
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            setSentTo(null);
            request.reset();
          }}
        >
          {t('login.useAnother')}
        </Button>
      </div>
    );
  }

  const emailError = form.formState.errors.email;
  const requestError = isApiError(request.error) ? request.error.code : null;
  const shownError = requestError ?? (request.isIdle ? initialError : null);

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">{t('login.title')}</h2>
        <p className="text-muted-foreground">{t('login.hint')}</p>
      </div>

      {shownError !== null && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {t(errorMessageKey(shownError))}
        </p>
      )}

      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void form.handleSubmit(({ email }) => request.mutate(email))(event)}
      >
        <div className="grid gap-2">
          <Label htmlFor="email">{t('login.emailLabel')}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder={t('login.emailPlaceholder')}
            aria-invalid={emailError !== undefined}
            aria-describedby={emailError === undefined ? undefined : 'email-error'}
            disabled={request.isPending}
            {...form.register('email')}
          />
          {emailError !== undefined && (
            <p id="email-error" className="text-sm text-destructive">
              {t('login.emailInvalid')}
            </p>
          )}
        </div>

        <Turnstile ref={turnstile} siteKey={turnstileSiteKey} locale={locale} onToken={onToken} />

        <Button type="submit" size="lg" disabled={request.isPending || turnstileToken === null}>
          {request.isPending
            ? t('login.sending')
            : turnstileToken === null
              ? t('login.turnstilePending')
              : t('login.submit')}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('login.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button asChild variant="outline" size="lg">
            {/* A full navigation to an API route (not a page): it redirects to Google and back. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
            <a href="/api/v1/auth/google/start">{t('login.google')}</a>
          </Button>
        </>
      )}
    </div>
  );
}
