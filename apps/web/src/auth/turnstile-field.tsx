'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type RefObject } from 'react';
import { Turnstile, type TurnstileHandle } from './turnstile';

interface TurnstileFieldProps {
  turnstileRef: RefObject<TurnstileHandle | null>;
  siteKey: string;
  locale: string;
  onToken: (token: string | null) => void;
}

/** The Turnstile widget plus «Не вдалося перевірити» with a retry when the challenge cannot run. */
export function TurnstileField({ turnstileRef, siteKey, locale, onToken }: TurnstileFieldProps) {
  const t = useTranslations();
  const [failed, setFailed] = useState(false);
  const handleToken = useCallback(
    (token: string | null) => {
      onToken(token);
      if (token !== null) setFailed(false);
    },
    [onToken],
  );
  const onError = useCallback(() => setFailed(true), []);
  return (
    <>
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        locale={locale}
        onToken={handleToken}
        onError={onError}
      />
      {failed && (
        <Alert
          variant="error"
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFailed(false);
                turnstileRef.current?.reset();
              }}
            >
              {t('login.turnstileRetry')}
            </Button>
          }
        >
          {t('login.turnstileFailed')}
        </Alert>
      )}
    </>
  );
}
