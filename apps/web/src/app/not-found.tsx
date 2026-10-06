import { Button } from '@stepler/ui/components/button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/api/server';
import { SiteHeader } from '@/components/site-header';

// Design pass (frontend-design, web-design-guidelines, responsive-design): one calm page for
// every missing address, whatever was asked for (an unknown route, a collection that is gone, or
// /ops for anyone but the operator), so it never tells which addresses exist. The public header
// (mark and wordmark), then a short message centred in a white card on the grey page, and one
// way on: «На головну» goes to the collections when signed in, to the landing otherwise. V1
// tokens, so light and dark follow the theme; the card is full width minus 16px on phones.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title'), robots: { index: false } };
}

export default async function NotFound() {
  const t = await getTranslations('notFound');
  const user = await getSessionUser();
  const home = user === null || user === 'unavailable' ? '/' : '/app';
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader brandHref={home} />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          aria-labelledby="not-found-title"
          className="grid w-full max-w-md justify-items-center gap-3 rounded-sheet border bg-card px-6 py-10 text-center"
        >
          <p className="type-data text-muted-foreground" translate="no">
            {t('code')}
          </p>
          <h1 id="not-found-title" className="type-h1">
            {t('title')}
          </h1>
          <p className="max-w-[36ch] text-pretty text-muted-foreground">{t('text')}</p>
          <Button asChild className="mt-2">
            <Link href={home}>{t('home')}</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
