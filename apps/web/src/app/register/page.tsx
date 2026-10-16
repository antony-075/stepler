import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { fetchAuthMethods, getSessionUser } from '@/api/server';
import { CenteredPage } from '@/components/centered-page';
import { LanguageSwitch } from '@/i18n/language-switch';
import { RegisterForm } from './register-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('register');
  return { title: t('pageTitle'), robots: { index: false, follow: true } };
}

/** «Створіть акаунт» (ADR 0019). Signed in → the admin area. */
export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') {
    redirect(user.legal.accepted ? '/app' : '/accept-terms');
  }
  const [methods, t] = await Promise.all([fetchAuthMethods(), getTranslations('login')]);
  return (
    <CenteredPage headerActions={<LanguageSwitch variant="header" />}>
      {methods === null ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <RegisterForm
          turnstileSiteKey={methods.turnstileSiteKey}
          googleEnabled={methods.google}
          legal={methods.legal}
        />
      )}
    </CenteredPage>
  );
}
