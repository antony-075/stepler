import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthPage } from '@/components/auth-page';
import { DeleteAccountConfirm } from './delete-account-confirm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('accountDeletion');
  // The URL carries the deletion token: never send it as a Referer.
  return { title: t('pageTitle'), referrer: 'no-referrer', robots: { index: false } };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The mailed deletion link (ADR 0020); works signed out, in any browser. */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <DeleteAccountConfirm token={typeof token === 'string' && TOKEN.test(token) ? token : null} />
    </AuthPage>
  );
}
