import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/api/server';
import { PreviewClient } from './preview-client';

// The editor's live preview of the guest page (plan Task 12, ADR 0017): framed by the editor on
// the same origin (next.config.ts: `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`), never
// indexed. It needs the admin session and reads admin endpoints only; it never creates a guest
// session or calls a guest API.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand');
  return { title: { absolute: t('name') }, robots: { index: false, follow: false } };
}

export default async function GuestPagePreview({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (user === null) redirect('/login');
  if (user !== 'unavailable' && !user.legal.accepted) redirect('/accept-terms');
  const { id } = await params;
  return <PreviewClient collectionId={id} />;
}
