'use client';

import { Toaster, ToastProvider } from '@stepler/ui/components/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isApiError } from './client';

/** Retries only failures that can succeed later; a 4xx answer won't change on retry. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/** Server-state client and the app's single toast outlet, so any screen can `useToast()`. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('toast');
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider label={t('announcement')}>
        {children}
        <Toaster label={t('region')} closeLabel={t('close')} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
