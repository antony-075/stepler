'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SETTING_SELECT } from '@/components/setting-control';
import { parseTheme } from './theme';
import { useThemePreference } from './theme-provider';

/** System / Light / Dark as a select, each with its icon; applies at once, no reload. */
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
    <Select value={preference} onValueChange={(value) => setPreference(parseTheme(value))}>
      <SelectTrigger
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={SETTING_SELECT}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="system">
            <Monitor aria-hidden="true" />
            {t('system')}
          </SelectItem>
          <SelectItem value="light">
            <Sun aria-hidden="true" />
            {t('light')}
          </SelectItem>
          <SelectItem value="dark">
            <Moon aria-hidden="true" />
            {t('dark')}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
