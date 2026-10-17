import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { fetchAuthMethods, getSessionUser } from '@/api/server';
import { AuthPage } from '@/components/auth-page';
import { getWebEnv } from '@/env';
import { type CallbackError, LoginForm } from './login-form';

const CALLBACK_ERRORS: readonly CallbackError[] = [
  'OAUTH_FAILED',
  'ACCOUNT_BLOCKED',
  'LEGAL_ACCEPTANCE_REQUIRED',
  'LEGAL_VERSION_OUTDATED',
];

/** The error code an OAuth callback sent back in `?error=`, if it is one the form explains. */
function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, tl] = await Promise.all([getTranslations('login'), getTranslations('landing')]);
  // Sign-in: not for the index; the marketing landing at `/` is.
  return {
    title: t('pageTitle'),
    description: tl('metaDescription'),
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signed in → the admin area; signed out or API unavailable → the form as usual.
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') {
    redirect(user.legal.accepted ? '/app' : '/accept-terms');
  }
  const [{ error }, methods, t] = await Promise.all([
    searchParams,
    fetchAuthMethods(),
    getTranslations('login'),
  ]);
  return (
    <AuthPage variant="login">
      {methods === null ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <LoginForm
          turnstileSiteKey={methods.turnstileSiteKey}
          googleEnabled={methods.google}
          initialError={callbackError(error)}
          contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null}
        />
      )}
    </AuthPage>
  );
}
