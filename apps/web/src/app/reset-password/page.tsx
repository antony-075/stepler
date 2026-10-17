import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthPage } from '@/components/auth-page';
import { getWebEnv } from '@/env';
import { ResetForm } from './reset-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reset');
  // The URL carries the reset token: never send it as a Referer.
  return { title: t('pageTitle'), referrer: 'no-referrer', robots: { index: false } };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <ResetForm
        token={typeof token === 'string' && TOKEN.test(token) ? token : null}
        contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null}
      />
    </AuthPage>
  );
}
