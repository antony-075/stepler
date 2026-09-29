import type { Metadata } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/api/query-provider';
import './globals.css';

// Self-hosted by Next.js at build time: the browser never contacts Google Fonts.
const manrope = Manrope({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-manrope',
  display: 'swap',
});
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['500', '600'],
  variable: '--font-unbounded',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand');
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${manrope.variable} ${unbounded.variable}`}>
      <body>
        <NextIntlClientProvider>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
