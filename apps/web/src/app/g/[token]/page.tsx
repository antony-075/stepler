import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GuestPage } from '@/guest/guest-page';

// Never the token or the collection's title: the tab title and history stay neutral, and the
// page is not indexed (also `X-Robots-Tag` in next.config.ts).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand');
  return { title: { absolute: t('name') }, robots: { index: false, follow: false } };
}

/**
 * A guest link (`/g/{token}`, spec §4): the session starts in the browser ([C3], G6). The whole
 * page, header and footer included, is `GuestPage`: once the collection is known it renders the
 * guest page template, which places them itself.
 */
export default async function GuestLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestPage token={token} />;
}
