import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/api/server';
import { AuthPage } from '@/components/auth-page';
import { AcceptTermsPanel } from './accept-terms-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('acceptTerms');
  return { title: t('pageTitle'), robots: { index: false } };
}

/**
 * The fallback acceptance step (ADR 0016): accounts from before the sign-in checkbox, a link
 * whose versions went stale, forced re-acceptance. Signed out → /login; already accepted →
 * /app; otherwise (or when the API cannot answer: the panel shows its own error) the panel.
 */
export default async function AcceptTermsPage() {
  const user = await getSessionUser();
  if (user === null) redirect('/login');
  if (user !== 'unavailable' && user.legal.accepted) redirect('/app');
  return (
    <AuthPage>
      <AcceptTermsPanel />
    </AuthPage>
  );
}
