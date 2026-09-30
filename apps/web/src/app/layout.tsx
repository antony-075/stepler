import type { Metadata } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/api/query-provider';
import { THEME_COOKIE, parseTheme, themeAttribute } from '@/theme/theme';
import { ThemeProvider } from '@/theme/theme-provider';
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
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // The theme is in the server HTML, so the first paint is right without a blocking script.
  return (
    <html
      lang={locale}
      data-theme={themeAttribute(theme)}
      className={`${manrope.variable} ${unbounded.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider initialPreference={theme}>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
