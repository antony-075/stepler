import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerifyPanel } from './verify-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verify');
  // The URL carries the magic-link token: never send it as a Referer.
  return { title: t('pageTitle'), referrer: 'no-referrer', robots: { index: false } };
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center px-4 py-10">
      <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        <VerifyPanel token={typeof token === 'string' && TOKEN.test(token) ? token : null} />
      </div>
    </main>
  );
}
