import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getOperatorSession } from '@/ops/api/server';
import { OpsShell } from '@/ops/ops-shell';
import { OpsUnavailable } from '@/ops/ops-unavailable';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ops');
  return { title: { absolute: t('title') }, robots: { index: false, follow: false } };
}

/**
 * The Stepler operator console (slice 9, R4). A nested layout under the shared root (html,
 * fonts, theme, intl, query client), with nothing of the user app's shell. The API decides who
 * the operator is; here a signed-out visitor goes to /login and anyone else gets the 404 page
 * ([P8]), before anything of the console renders.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const session = await getOperatorSession();
  if (session === 'signed-out') redirect('/login');
  if (session === null) notFound();
  if (session === 'unavailable') {
    return (
      <OpsShell email={null}>
        <OpsUnavailable />
      </OpsShell>
    );
  }
  return <OpsShell email={session.email}>{children}</OpsShell>;
}
