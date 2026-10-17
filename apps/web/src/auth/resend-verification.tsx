'use client';

import { authEmailSentResponseSchema, type ErrorCode } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { apiRequest, isApiError } from '@/api/client';
import { errorMessageKey } from '@/errors/error-message';

const errorCode = (error: unknown): ErrorCode => (isApiError(error) ? error.code : 'INTERNAL');
import { isLocale } from '@/i18n/locales';
import type { TurnstileHandle } from './turnstile';
import { TurnstileField } from './turnstile-field';

/**
 * «Надіслати лист ще раз» for an unconfirmed address (ADR 0019): a fresh Turnstile check, then
 * `POST /auth/verification`, which answers the same for any address; «надіслано» once it did.
 */
export function ResendVerification({
  email,
  turnstileSiteKey,
}: {
  email: string;
  turnstileSiteKey: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const turnstile = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((next: string | null) => setToken(next), []);
  const resend = useMutation({
    mutationFn: () =>
      apiRequest('/auth/verification', {
        method: 'POST',
        body: { email, turnstileToken: token ?? '', ...(isLocale(locale) ? { locale } : {}) },
        schema: authEmailSentResponseSchema,
      }),
    onSettled: () => turnstile.current?.reset(),
  });
  return (
    <div className="grid gap-3">
      <TurnstileField
        turnstileRef={turnstile}
        siteKey={turnstileSiteKey}
        locale={locale}
        onToken={onToken}
      />
      {resend.isSuccess ? (
        <p role="status" className="text-sm text-success">
          {t('login.resent')}
        </p>
      ) : null}
      {resend.isError ? (
        <Alert variant="error">{t(errorMessageKey(errorCode(resend.error)))}</Alert>
      ) : null}
      <Button
        variant="outline"
        size="lg"
        disabled={token === null || resend.isPending}
        onClick={() => resend.mutate()}
      >
        {resend.isPending
          ? t('login.resending')
          : token === null
            ? t('login.turnstilePending')
            : t('login.resend')}
      </Button>
    </div>
  );
}
