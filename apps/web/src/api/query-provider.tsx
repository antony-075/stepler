'use client';

import { Toaster, ToastProvider } from '@stepler/ui/components/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isApiError } from './client';

/** Retries only failures that can succeed later; a 4xx answer won't change on retry. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * Guest pages (and the editor's preview of them) keep their toasts at the bottom: the top of the
 * page is the template's (the T2 hero with its language switch on phones), and their actions sit
 * in a bottom bar the toasts already stay clear of.
 */
const BOTTOM_TOASTS = /^\/(g|preview)\//;

/** Server-state client and the app's single toast outlet, so any screen can `useToast()`. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('toast');
  const pathname = usePathname();
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
      <ToastProvider announcementLabel={t('announcement')}>
        {children}
        <Toaster
          label={t('region')}
          closeLabel={t('close')}
          position={BOTTOM_TOASTS.test(pathname) ? 'bottom' : 'top-right'}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}
