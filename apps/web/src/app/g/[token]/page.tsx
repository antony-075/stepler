import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/site-header';
import { GuestLinkLanding } from './guest-link-landing';

// Never the token or the collection's title: the tab title and history stay neutral, and the
// page is not indexed (also `X-Robots-Tag` in next.config.ts).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand');
  return { title: { absolute: t('name') }, robots: { index: false, follow: false } };
}

/** A guest link (`/g/{token}`, spec §4). The state is resolved in the browser (G6). */
export default async function GuestLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-12 lg:pt-16">
        <div className="mx-auto w-full max-w-[560px]">
          <GuestLinkLanding token={token} />
        </div>
      </main>
    </div>
  );
}
