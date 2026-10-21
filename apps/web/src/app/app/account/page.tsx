import { Panel } from '@stepler/ui/components/panel';
import { Globe, KeyRound, Scale, Sun, UserRound, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AdminPage } from '@/components/admin-page';
import { LanguageSwitch } from '@/i18n/language-switch';
import { ThemeSwitch } from '@/theme/theme-switch';
import { DeleteAccount } from './delete-account';
import { LegalStatusBlock } from './legal-status';
import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('pageTitle') };
}

/**
 * «Акаунт»: your name, how Stepler looks and which language it speaks (DESIGN-SYSTEM.md §6.8; the owner's
 * reference 2026-10-02, renamed from «Налаштування» so no two places share a name). The h1 and
 * one line (no back link: the sidebar is the navigation), then one sheet with a section per preference: an icon, the name and what it
 * changes on the left, the control on the right from `xl` (stacked below it, so the three theme
 * cards keep room for their pictures). The theme lives in a cookie; the language is saved to
 * the profile too. Below the sheet, the danger zone deletes the account (ADR 0020). Reached from
 * the sidebar's «Акаунт», under «Колекції».
 */
export default async function AccountPage() {
  const t = await getTranslations();
  return (
    // A form page: a readable column inside the fluid admin frame (DESIGN-SYSTEM.md §6.0).
    <AdminPage className="*:max-w-[1240px]">
      <header className="grid gap-2">
        <h1 className="type-h1">{t('account.pageTitle')}</h1>
        <p className="max-w-[60ch] text-muted-foreground">{t('account.description')}</p>
      </header>
      <Panel className="divide-y">
        <SettingBlock
          id="account-profile"
          icon={UserRound}
          title={t('account.profile.title')}
          hint={t('account.profile.hint')}
        >
          <ProfileForm />
        </SettingBlock>
        <SettingBlock
          id="account-password"
          icon={KeyRound}
          title={t('accountPassword.title')}
          hint={t('accountPassword.hint')}
        >
          <PasswordForm />
        </SettingBlock>
        <SettingBlock
          id="account-appearance"
          icon={Sun}
          title={t('account.appearance')}
          hint={t('account.appearanceHint')}
        >
          <ThemeSwitch labelledBy="account-appearance" describedBy="account-appearance-hint" />
        </SettingBlock>
        <SettingBlock
          id="account-language"
          icon={Globe}
          title={t('language.label')}
          hint={t('account.languageHint')}
        >
          <LanguageSwitch labelledBy="account-language" describedBy="account-language-hint" />
        </SettingBlock>
        <SettingBlock
          id="account-legal"
          icon={Scale}
          title={t('account.legal.title')}
          hint={t('account.legal.hint')}
        >
          <LegalStatusBlock />
        </SettingBlock>
      </Panel>
      <DeleteAccount />
    </AdminPage>
  );
}

/** One setting: a muted icon disc, the h2 and its hint, then the control. */
function SettingBlock({
  id,
  icon: Icon,
  title,
  hint,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:gap-10"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-full border bg-background text-muted-foreground"
        >
          <Icon className="size-5" />
        </span>
        <div className="grid gap-1 pt-0.5">
          <h2 id={id} className="type-h3">
            {title}
          </h2>
          <p id={`${id}-hint`} className="max-w-[44ch] text-sm text-pretty text-muted-foreground">
            {hint}
          </p>
        </div>
      </div>
      <div className="min-w-0 xl:pt-0.5">{children}</div>
    </section>
  );
}
