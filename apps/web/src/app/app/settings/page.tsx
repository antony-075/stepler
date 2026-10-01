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

/**
 * One setting: its name and a one-line hint on the left, the control on the right from 600px.
 * On phones they stack and the control fills the row. The hint describes the control
 * (`aria-describedby` on it).
 */
function SettingRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-[1.125rem] min-[600px]:grid-cols-[minmax(0,1fr)_auto] min-[600px]:items-center min-[600px]:gap-6 min-[600px]:px-6 min-[600px]:py-5">
      <div className="min-w-0">
        <div id={id} className="text-[0.9375rem] font-semibold">
          {label}
        </div>
        <p
          id={`${id}-hint`}
          className="mt-0.5 max-w-[40ch] text-sm leading-[1.45] text-muted-foreground"
        >
          {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

/** Theme and language. The theme lives in a cookie; the language is saved to the profile too. */
export default async function SettingsPage() {
  const t = await getTranslations();
  return (
    <main className="stepler-container pt-8 pb-16 lg:pt-10 lg:pb-20">
      <div className="max-w-[720px]">
        <PageHeader
          size="compact"
          title={t('settings.pageTitle')}
          description={t('settings.description')}
        />
        <section aria-labelledby="settings-appearance" className="mt-8">
          <h2 id="settings-appearance" className="text-base leading-snug font-semibold">
            {t('settings.appearance')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.appearanceHint')}</p>
          <div className="mt-3 divide-y rounded-2xl border bg-card shadow-xs">
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
          </div>
        </section>
      </div>
    </main>
  );
}
