import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/api/server';
import { SignInLanding } from './sign-in-landing';

export async function generateMetadata(): Promise<Metadata> {
  const [t, tl] = await Promise.all([getTranslations('login'), getTranslations('landing')]);
  // The same page as `/`, which is the one to index.
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
  const { error } = await searchParams;
  return <SignInLanding error={error} />;
}
