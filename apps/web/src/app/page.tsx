import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/api/server';
import { SignInLanding } from './login/sign-in-landing';

// The main page is the sign-in landing until a marketing page exists. Signed in → the admin area;
// signed out or API unavailable → the landing as usual.
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('landing'), getLocale()]);
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title: { absolute: title },
    description,
    openGraph: { type: 'website', title, description, locale: locale === 'uk' ? 'uk_UA' : 'en' },
  };
}

export default async function HomePage() {
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') redirect('/app');
  return <SignInLanding />;
}
