'use client';

import { Button } from '@stepler/ui/components/button';
import { useTranslations } from 'next-intl';
import { useChangeLocale } from '@/i18n/language-switch';

/**
 * The guest header's language control: one 44px button naming the other language in that
 * language («English» on the Ukrainian page, «Українська» on the English one), with `lang` so it
 * is read correctly. A guest switches once; a select would be more chrome than the choice needs.
 */
export function GuestLanguageToggle() {
  const t = useTranslations('language');
  const { locale, changeLocale } = useChangeLocale();
  const other = locale === 'uk' ? 'en' : 'uk';
  return (
    <Button variant="ghost" lang={other} onClick={() => changeLocale(other)}>
      {t(other)}
    </Button>
  );
}
