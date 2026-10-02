'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { magicLinkRequestSchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { useMutation } from '@tanstack/react-query';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { CircleAlert, Mail, MailCheck, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { errorMessageKey } from '@/errors/error-message';
import { isLocale } from '@/i18n/locales';
import { GoogleMark } from './google-mark';
import { Turnstile, type TurnstileHandle } from './turnstile';

const emailFormSchema = magicLinkRequestSchema.pick({ email: true });

// The Ukrainian labels are wider than a 320–360px panel: tighter padding below `sm`, and the
// label wraps (the button grows) instead of pushing the form out of the panel.
const WRAPPING_BUTTON = 'h-auto min-h-12 py-2 whitespace-normal text-balance max-sm:px-4';
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
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const onToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
    if (token !== null) setTurnstileFailed(false);
  }, []);
  const onTurnstileError = useCallback(() => setTurnstileFailed(true), []);

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
        <h2 className="flex items-center gap-2.5 type-h2">
          <MailCheck
            aria-hidden="true"
            className="size-6 shrink-0 text-success"
            strokeWidth={1.75}
          />
          {t('login.sentTitle')}
        </h2>
        <p className="text-muted-foreground">{t('login.sentText', { email: sentTo })}</p>
        <p className="text-muted-foreground">{t('login.sentHint')}</p>
        <Button
          variant="ghost"
          className="-ml-3 justify-self-start text-link underline underline-offset-4"
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
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-2 text-center sm:gap-3">
        <TintTile tint="sage" className="max-sm:hidden [&_svg]:size-7">
          <UserRound strokeWidth={1.75} />
        </TintTile>
        <h2 className="type-h2">{t('login.title')}</h2>
        <p className="max-w-[40ch] text-pretty text-muted-foreground">{t('login.lead')}</p>
      </div>

      {shownError !== null && <Alert variant="error">{t(errorMessageKey(shownError))}</Alert>}

      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => void form.handleSubmit(({ email }) => request.mutate(email))(event)}
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
              autoComplete="email"
              spellCheck={false}
              placeholder={t('login.emailPlaceholder')}
              aria-invalid={emailError !== undefined}
              aria-describedby={emailError === undefined ? undefined : 'email-error'}
              disabled={request.isPending}
              className="pl-11"
              {...form.register('email')}
            />
          </div>
          {emailError !== undefined && (
            <p
              id="email-error"
              className="flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{t('login.emailInvalid')}</span>
            </p>
          )}
        </div>

        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          locale={locale}
          onToken={onToken}
          onError={onTurnstileError}
        />
        {turnstileFailed && (
          <Alert
            variant="error"
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTurnstileFailed(false);
                  turnstile.current?.reset();
                }}
              >
                {t('login.turnstileRetry')}
              </Button>
            }
          >
            {t('login.turnstileFailed')}
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          className={WRAPPING_BUTTON}
          disabled={request.isPending || turnstileToken === null}
        >
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
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            {t('login.or')}
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <Button asChild variant="outline" size="lg" className={WRAPPING_BUTTON}>
            {/* A full navigation to an API route (not a page): it redirects to Google and back. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, not a page */}
            <a href="/api/v1/auth/google/start">
              <GoogleMark className="size-[18px]" />
              {t('login.google')}
            </a>
          </Button>
        </>
      )}
      <p className="type-small text-muted-foreground">{t('login.hint')}</p>
    </div>
  );
}
