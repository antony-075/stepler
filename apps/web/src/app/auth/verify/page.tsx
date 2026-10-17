import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthPage } from '@/components/auth-page';
import { getWebEnv } from '@/env';
import { VerifyPanel } from './verify-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verify');
  // The URL carries the confirmation token: never send it as a Referer.
  return { title: t('pageTitle'), referrer: 'no-referrer', robots: { index: false } };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <VerifyPanel
        token={typeof token === 'string' && TOKEN.test(token) ? token : null}
        contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null}
      />
    </AuthPage>
  );
}
