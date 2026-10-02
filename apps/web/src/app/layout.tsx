import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/api/query-provider';
import { THEME_COOKIE, parseTheme, themeAttribute } from '@/theme/theme';
import { ThemeProvider } from '@/theme/theme-provider';
import { geistMono, geologica } from './fonts';
import './globals.css';

// Browser chrome in the page colour (--background, light and dark). It follows the system
// setting; an explicit theme choice in the cookie is not reflected here.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f1ee' },
    { media: '(prefers-color-scheme: dark)', color: '#141615' },
  ],
};

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
      className={`${geologica.variable} ${geistMono.variable}`}
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
