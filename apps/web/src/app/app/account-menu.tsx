'use client';

import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiRequest } from '@/api/client';

/**
 * The signed-in admin's menu. The trigger is an avatar initial, plus the email from `md`
 * (truncated, full address in `title`); on phones the email stays the trigger's accessible name
 * but is visually hidden. The menu repeats the full address, then settings and sign out.
 */
export function AccountMenu({ email }: { email: string }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logout = useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
    onError: () => toast({ variant: 'error', title: t('app.logoutFailed') }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Button keeps its content on one line and refuses to shrink: let it, so a long
            address truncates instead of widening the header. */}
        <Button
          variant="ghost"
          className="max-w-full min-w-0 shrink gap-2.5 px-1.5 text-foreground has-[>svg]:px-1.5 md:pr-2"
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/14 text-[0.8125rem] font-semibold text-primary"
          >
            {initial(email)}
          </span>
          <span
            className="sr-only text-sm font-semibold md:not-sr-only md:max-w-[26ch] md:truncate"
            title={email}
          >
            {email}
          </span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="text-xs text-muted-foreground">{t('app.signedInAs')}</span>
          <span className="truncate text-sm font-semibold text-foreground" title={email}>
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings" className="no-underline">
            <Settings aria-hidden="true" />
            {t('settings.pageTitle')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut aria-hidden="true" />
          {t('app.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The first letter of the address, for the avatar. */
function initial(email: string): string {
  return (Array.from(email)[0] ?? '?').toLocaleUpperCase();
}
