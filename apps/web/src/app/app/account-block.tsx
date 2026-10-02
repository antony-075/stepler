'use client';

import { Button } from '@stepler/ui/components/button';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiRequest } from '@/api/client';
import { accountInitial } from './account-initial';

/**
 * Who is signed in, always visible in the top bar (owner 2026-10-02: no dropdown): a violet
 * avatar initial, the name (600) above the email (muted, truncated, full address in `title`),
 * then a separate «Вийти». Without a name, the email alone on one line and the avatar takes its
 * first letter. On phones only the avatar shows (the name and email stay for screen readers)
 * and «Вийти» is an icon button named by its `aria-label`.
 */
export function AccountBlock({
  email,
  displayName,
}: {
  email: string;
  displayName: string | null;
}) {
  const t = useTranslations('app');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logout = useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
    onError: () => toast({ variant: 'error', title: t('logoutFailed') }),
  });

  const signOut = () => {
    if (!logout.isPending) logout.mutate();
  };

  return (
    <div data-slot="account-block" className="flex min-w-0 items-center gap-2 md:gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-link text-sm font-semibold text-primary-foreground"
        >
          {accountInitial(displayName, email)}
        </span>
        <p className="sr-only grid min-w-0 leading-tight md:not-sr-only md:max-w-[30ch]">
          <span className="sr-only">{t('signedInAs')} </span>
          {displayName === null ? null : (
            <span className="truncate text-sm font-semibold" title={displayName}>
              {displayName}
            </span>
          )}
          <span
            className={
              displayName === null
                ? 'truncate text-sm font-medium'
                : 'truncate text-[0.8125rem] text-muted-foreground'
            }
            title={email}
          >
            {email}
          </span>
        </p>
      </div>
      {/* Phones: a 44px icon button; from `md` a quiet 36px ghost with the word. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('logout')}
        aria-disabled={logout.isPending || undefined}
        onClick={signOut}
        className="-mr-2.5 md:hidden"
      >
        <LogOut aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-disabled={logout.isPending || undefined}
        onClick={signOut}
        className="hidden gap-2 font-normal md:inline-flex"
      >
        <LogOut aria-hidden="true" />
        {t('logout')}
      </Button>
    </div>
  );
}
