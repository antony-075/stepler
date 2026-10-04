'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type LegalVersions, magicLinkRequestSchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, Mail, MailCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { apiRequest, isApiError } from '@/api/client';
import { errorMessageKey } from '@/errors/error-message';
import { isLocale } from '@/i18n/locales';
import { LegalConsent } from '@/legal/legal-consent';
import { GoogleMark } from './google-mark';
import { Turnstile, type TurnstileHandle } from './turnstile';

const emailFormSchema = magicLinkRequestSchema.pick({ email: true });

// The Ukrainian labels are wider than a 320–360px panel: tighter padding below `sm`, and the
// label wraps (the button grows) instead of pushing the form out of the panel.
const WRAPPING_BUTTON = 'h-auto min-h-12 py-2 whitespace-normal text-balance max-sm:px-4';
type EmailForm = z.infer<typeof emailFormSchema>;

/** The reason the disabled sign-in buttons give (ADR 0016), shown while the box is unticked. */
const LEGAL_HINT_ID = 'legal-hint';

export type CallbackError =
  'OAUTH_FAILED' | 'ACCOUNT_BLOCKED' | 'LEGAL_ACCEPTANCE_REQUIRED' | 'LEGAL_VERSION_OUTDATED';

interface LoginFormProps {
  turnstileSiteKey: string;
  googleEnabled: boolean;
  /** The current document versions (`GET /auth/methods`), sent back once the box is ticked. */
  legal: LegalVersions;
  /** An error code carried back from the Google callback or start (`/login?error=…`). */
  initialError: CallbackError | null;
}

/**
 * The sign-in card. Owner decision L1 (ADR 0016): a required checkbox accepts the Terms and the
 * Privacy Policy for everyone (the card cannot know whether the address is new without telling);
 * it sits between Turnstile and the submit, and both «Отримати посилання для входу» and
 * «Продовжити з Google» stay disabled until it is ticked — the owner's explicit exception to
 * DESIGN-SYSTEM §9 for this one form. The disabled buttons point at the visible hint with
 * `aria-describedby`, so the reason is announced. The API enforces the same rule; the buttons are
 * UX. The versions travel in the request body and in the Google start link. The box is not
 * remembered: a new visit asks again.
 */
export function LoginForm({
  turnstileSiteKey,
  googleEnabled,
  legal,
  initialError,
}: LoginFormProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [legalAccepted, setLegalAccepted] = useState(false);
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
          legal,
        },
      }),
    onSuccess: (_data, email) => setSentTo(email),
    onError: (error) => {
      // The documents changed while the card was open: fetch the new versions, ask again.
      if (!isApiError(error, 'LEGAL_VERSION_OUTDATED')) return;
      setLegalAccepted(false);
      router.refresh();
    },
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

        <div className="grid gap-1">
          <LegalConsent
            id="legal-accept"
            messageKey="login.legalCheckbox"
            checked={legalAccepted}
            onCheckedChange={setLegalAccepted}
            disabled={request.isPending}
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
          disabled={request.isPending || turnstileToken === null || !legalAccepted}
          aria-describedby={legalAccepted ? undefined : LEGAL_HINT_ID}
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
          {legalAccepted ? (
            <Button asChild variant="outline" size="lg" className={WRAPPING_BUTTON}>
              {/* A full navigation to an API route (not a page): it redirects to Google and back.
                  The versions ride along; the API refuses a start without them. */}
              <a href={googleStartHref(legal)}>
                <GoogleMark className="size-[18px]" />
                {t('login.google')}
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
              {t('login.google')}
            </Button>
          )}
        </>
      )}
      <p className="type-small text-muted-foreground">{t('login.hint')}</p>
    </div>
  );
}

function googleStartHref(legal: LegalVersions): string {
  const query = new URLSearchParams({ terms: legal.terms, privacy: legal.privacy });
  return `/api/v1/auth/google/start?${query.toString()}`;
}
