import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { CenteredPage } from '@/components/centered-page';
import { LanguageSwitch } from '@/i18n/language-switch';
import { ForgotForm } from './forgot-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forgot');
  return { title: t('pageTitle'), robots: { index: false } };
}

/** «Забули пароль?» (ADR 0019): also how an account from Google sets its first password. */
export default async function ForgotPasswordPage() {
  const [methods, t] = await Promise.all([fetchAuthMethods(), getTranslations('login')]);
  return (
    <CenteredPage headerActions={<LanguageSwitch variant="header" />}>
      {methods === null ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <ForgotForm turnstileSiteKey={methods.turnstileSiteKey} />
      )}
    </CenteredPage>
  );
}
