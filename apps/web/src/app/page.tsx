import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/api/server';
import { LandingPage } from '@/landing/landing-page';
import { screenLocale } from '@/landing/screens';

/**
 * The origin the page was requested on, for the absolute Open Graph image URL: from the request's
 * Host (and the edge's X-Forwarded-Proto), never a hardcoded domain, since production's is not
 * confirmed yet. No canonical URL for the same reason.
 */
async function requestOrigin(): Promise<URL | undefined> {
  const list = await headers();
  const host = list.get('host');
  if (host === null) return undefined;
  const proto = list.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' ? 'https' : 'http';
  try {
    return new URL(`${proto}://${host}`);
  } catch {
    return undefined;
  }
}

// The marketing landing (src/landing). Signed in → the admin area; signed out or API
// unavailable → the landing. Sign-in itself lives on /login.
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, origin] = await Promise.all([
    getTranslations('home'),
    getLocale(),
    requestOrigin(),
  ]);
  const title = t('metaTitle');
  const description = t('metaDescription');
  const image = `/landing/og-${screenLocale(locale)}.jpg`;
  return {
    metadataBase: origin,
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      locale: locale === 'uk' ? 'uk_UA' : 'en',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function HomePage() {
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') {
    redirect(user.legal.accepted ? '/app' : '/accept-terms');
  }
  return <LandingPage />;
}
