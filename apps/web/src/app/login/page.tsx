import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignInLanding } from './sign-in-landing';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('pageTitle') };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return <SignInLanding error={error} />;
}
