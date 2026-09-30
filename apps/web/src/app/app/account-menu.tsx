'use client';

import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiRequest } from '@/api/client';
import { useChangeLocale } from '@/i18n/language-switch';
import { parseTheme } from '@/theme/theme';
import { useThemePreference } from '@/theme/theme-provider';

/**
 * The signed-in admin's menu: the email as the trigger (truncated, full address in `title` and
 * in the menu), language and theme (the same actions as the public header switches), sign out.
 */
export function AccountMenu({ email }: { email: string }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { locale, changeLocale } = useChangeLocale();
  const { preference, setPreference } = useThemePreference();
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('language.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-label={t('language.label')}
          value={locale}
          onValueChange={changeLocale}
        >
          <DropdownMenuRadioItem value="uk" lang="uk">
            {t('language.uk')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" lang="en">
            {t('language.en')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-label={t('theme.label')}
          value={preference}
          onValueChange={(value) => setPreference(parseTheme(value))}
        >
          <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut aria-hidden="true" />
          {t('app.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
