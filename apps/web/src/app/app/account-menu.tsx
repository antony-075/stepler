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
 * The signed-in admin's menu: the email as the trigger (truncated, full address in `title` and
 * in the menu), a link to the settings page (theme and language), sign out.
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
        <Button variant="ghost" className="max-w-full min-w-0 shrink px-3 text-foreground">
          <span className="truncate text-sm font-semibold" title={email}>
            {email}
          </span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-normal">
          {t('app.signedInAs', { email })}
        </DropdownMenuLabel>
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
