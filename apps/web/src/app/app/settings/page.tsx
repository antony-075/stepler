import { Card, CardContent, CardHeader, CardTitle } from '@stepler/ui/components/card';
import { PageHeader } from '@stepler/ui/components/page-header';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/i18n/language-switch';
import { ThemeSwitch } from '@/theme/theme-switch';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('pageTitle') };
}

/** One setting: its name above the control on phones, beside it from `sm`. */
function SettingRow({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <span id={id} className="font-semibold">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Theme and language. The theme lives in a cookie; the language is saved to the profile too. */
export default async function SettingsPage() {
  const t = await getTranslations();
  return (
    <main className="stepler-container grid gap-6 py-8">
      <PageHeader title={t('settings.pageTitle')} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <SettingRow id="settings-theme" label={t('theme.label')}>
            <ThemeSwitch labelledBy="settings-theme" />
          </SettingRow>
          <SettingRow id="settings-language" label={t('language.label')}>
            <LanguageSwitch labelledBy="settings-language" />
          </SettingRow>
        </CardContent>
      </Card>
    </main>
  );
}
