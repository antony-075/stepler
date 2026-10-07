'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

/** The API could not say who is signed in: the console shell with a retry. */
export function OpsUnavailable() {
  const t = useTranslations('ops');
  const router = useRouter();
  return (
    <Alert
      variant="error"
      title={t('unavailable')}
      action={
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          {t('retry')}
        </Button>
      }
    />
  );
}
