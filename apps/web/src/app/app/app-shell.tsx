'use client';

import { meResponseSchema } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { apiRequest, isApiError } from '@/api/client';
import { SiteHeader } from '@/components/site-header';
import { errorMessageKey } from '@/errors/error-message';

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest('/me', { schema: meResponseSchema }),
  });
  const logout = useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  const unauthenticated = isApiError(me.error, 'UNAUTHENTICATED');
  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  if (me.data === undefined) {
    const failed = me.error !== null && !unauthenticated;
    const failure = isApiError(me.error) ? me.error.code : 'INTERNAL';
    return (
      <main className="stepler-atmosphere grid min-h-dvh place-items-center px-4">
        {failed ? (
          <div className="grid gap-4 text-center">
            <p role="alert">{t(errorMessageKey(failure))}</p>
            <Button onClick={() => void me.refetch()}>{t('verify.retry')}</Button>
          </div>
        ) : (
          <p role="status">{t('app.loading')}</p>
        )}
      </main>
    );
  }

  return (
    <div className="stepler-atmosphere flex min-h-dvh flex-col">
      <SiteHeader>
        <div className="flex min-w-0 items-center gap-3">
          <p className="max-w-[40vw] min-w-0 truncate text-sm text-muted-foreground sm:max-w-xs">
            {t('app.signedInAs', { email: me.data.email })}
          </p>
          <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {t('app.logout')}
          </Button>
        </div>
      </SiteHeader>
      <div className="flex-1">{children}</div>
    </div>
  );
}
