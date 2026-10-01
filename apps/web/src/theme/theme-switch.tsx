'use client';

import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SETTING_CONTROL, SETTING_ITEM } from '@/components/setting-control';
import { parseTheme } from './theme';
import { useThemePreference } from './theme-provider';

// Below 400px the icons go so the three labels keep their equal thirds.
const ITEM = `${SETTING_ITEM} max-[399px]:[&_[data-slot=toggle-group-item-icon]]:hidden`;

/** System / Light / Dark as a segmented control; applies at once, no reload. */
export function ThemeSwitch({
  labelledBy,
  describedBy,
}: {
  labelledBy: string;
  describedBy?: string;
}) {
  const t = useTranslations('theme');
  const { preference, setPreference } = useThemePreference();
  return (
    <ToggleGroup
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      value={preference}
      onValueChange={(value) => setPreference(parseTheme(value))}
      className={SETTING_CONTROL}
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
