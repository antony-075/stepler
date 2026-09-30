'use client';

import { Button } from '@stepler/ui/components/button';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseTheme, type ThemePreference } from './theme';
import { useThemePreference } from './theme-provider';

const CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * System / Light / Dark; applies at once, no reload. From `sm` a three-item segmented control;
 * on phones one button (as in the v4 prototype) that shows the current mode and cycles
 * System → Light → Dark, its name saying both the current theme and the next one.
 */
export function ThemeSwitch() {
  const t = useTranslations('theme');
  const { preference, setPreference } = useThemePreference();
  const next = CYCLE[preference];
  const Icon = ICONS[preference];
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full text-foreground sm:hidden"
        aria-label={t('cycle', { current: t(preference), next: t(next) })}
        onClick={() => setPreference(next)}
      >
        <Icon aria-hidden="true" className="size-[18px]" />
      </Button>
      <ToggleGroup
        aria-label={t('label')}
        value={preference}
        onValueChange={(value) => setPreference(parseTheme(value))}
        className="max-sm:hidden"
      >
        <ToggleGroupItem value="system" icon={<Monitor />}>
          {t('system')}
        </ToggleGroupItem>
        <ToggleGroupItem value="light" icon={<Sun />}>
          {t('light')}
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" icon={<Moon />}>
          {t('dark')}
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  );
}
