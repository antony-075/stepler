import { PageHeader } from '@stepler/ui/components/page-header';
import { SettingRow, SettingsSection } from '@stepler/ui/components/setting-row';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { LanguageSwitch } from '@/i18n/language-switch';
import { ThemeSwitch } from '@/theme/theme-switch';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('pageTitle') };
}

/**
 * Theme and language, in one centred 640px column (DESIGN-SYSTEM.md §6.8): back link, h1, then
 * sections of an h2 over a panel of rows. The theme lives in a cookie; the language is saved to
 * the profile too. Reached from the account menu; the back link above the title returns to the
 * collections.
 */
export default async function SettingsPage() {
  const t = await getTranslations();
  return (
    <main className="stepler-container pt-5 pb-16 lg:pt-8 lg:pb-20">
      <div className="mx-auto max-w-[640px]">
        <PageHeader
          size="compact"
          back={<BackLink href="/app">{t('settings.back')}</BackLink>}
          title={t('settings.pageTitle')}
          description={t('settings.description')}
        />
        <SettingsSection
          id="settings-appearance"
          title={t('settings.appearance')}
          description={t('settings.appearanceHint')}
          className="mt-8 lg:mt-10"
        >
          <SettingRow id="settings-theme" label={t('theme.label')} hint={t('settings.themeHint')}>
            <ThemeSwitch labelledBy="settings-theme" describedBy="settings-theme-hint" />
          </SettingRow>
          <SettingRow
            id="settings-language"
            label={t('language.label')}
            hint={t('settings.languageHint')}
          >
            <LanguageSwitch labelledBy="settings-language" describedBy="settings-language-hint" />
          </SettingRow>
        </SettingsSection>
      </div>
    </main>
  );
}
