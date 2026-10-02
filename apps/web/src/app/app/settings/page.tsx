import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
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
    <div className="grid gap-3 p-4 min-[600px]:grid-cols-[minmax(0,1fr)_auto] min-[600px]:items-center min-[600px]:gap-6 min-[600px]:px-6 min-[600px]:py-5">
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
          back={
            <Link
              href="/app"
              className={cn(
                '-ml-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1.5 text-sm font-semibold text-muted-foreground no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none',
                focusRing,
              )}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t('settings.back')}
            </Link>
          }
          title={t('settings.pageTitle')}
          description={t('settings.description')}
        />
        <section aria-labelledby="settings-appearance" className="mt-8 lg:mt-10">
          <h2 id="settings-appearance" className="type-h2">
            {t('settings.appearance')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.appearanceHint')}</p>
          <Panel className="mt-4 divide-y">
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
          </Panel>
        </section>
      </div>
    </main>
  );
}
