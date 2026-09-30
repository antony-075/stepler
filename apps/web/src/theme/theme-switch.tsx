'use client';

import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseTheme } from './theme';
import { useThemePreference } from './theme-provider';

// Below 360px the three labelled items need slightly less padding to fit a card.
const ITEM = 'max-[359px]:px-2';

/** System / Light / Dark as a segmented control; applies at once, no reload. */
export function ThemeSwitch({ labelledBy }: { labelledBy: string }) {
  const t = useTranslations('theme');
  const { preference, setPreference } = useThemePreference();
  return (
    <ToggleGroup
      aria-labelledby={labelledBy}
      value={preference}
      onValueChange={(value) => setPreference(parseTheme(value))}
    >
      <ToggleGroupItem value="system" className={ITEM} icon={<Monitor />}>
        {t('system')}
      </ToggleGroupItem>
      <ToggleGroupItem value="light" className={ITEM} icon={<Sun />}>
        {t('light')}
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className={ITEM} icon={<Moon />}>
        {t('dark')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
