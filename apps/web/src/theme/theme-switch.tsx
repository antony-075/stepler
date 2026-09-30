'use client';

import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseTheme } from './theme';
import { useThemePreference } from './theme-provider';

/** System / Light / Dark. Applies at once, no reload; icons only on phones. */
export function ThemeSwitch({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const { preference, setPreference } = useThemePreference();
  return (
    <ToggleGroup
      aria-label={t('label')}
      value={preference}
      onValueChange={(value) => setPreference(parseTheme(value))}
      className={className}
    >
      <ToggleGroupItem value="system" icon={<Monitor />} hideLabel="phone">
        {t('system')}
      </ToggleGroupItem>
      <ToggleGroupItem value="light" icon={<Sun />} hideLabel="phone">
        {t('light')}
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" icon={<Moon />} hideLabel="phone">
        {t('dark')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
