import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/api/server';
import { SignInLanding } from './sign-in-landing';

export async function generateMetadata(): Promise<Metadata> {
  const [t, origin] = await Promise.all([getTranslations('login'), requestOrigin()]);
  // /login renders the same landing as /: point search engines at the main page.
  return { title: t('pageTitle'), alternates: { canonical: `${origin}/` } };
}

/**
 * This request's origin, for an absolute canonical URL (there is no configured public origin and
 * a relative one would resolve against localhost). The proxy sets `x-forwarded-proto`.
 */
async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost';
  const proto =
    list.get('x-forwarded-proto') ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto.split(',')[0]!.trim()}://${host.split(',')[0]!.trim()}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signed in → the admin area; signed out or API unavailable → the form as usual.
  const user = await getSessionUser();
  if (user !== null && user !== 'unavailable') redirect('/app');
  const { error } = await searchParams;
  return <SignInLanding error={error} />;
}
