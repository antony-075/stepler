import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/api/query-provider';
import { THEME_COOKIE, parseTheme, themeAttribute } from '@/theme/theme';
import { ThemeProvider } from '@/theme/theme-provider';
import { geistMono, geologica, golosText } from './fonts';
import './globals.css';

// Browser chrome in the page colour (--background, light and dark). It follows the system
// setting; an explicit theme choice in the cookie is not reflected here.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('brand');
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    // The brand's icons (public/brand, refined from the owner's assets 2026-10-06): the SVG for
    // browsers that take it, PNG sizes for the rest, the 180px tile for iOS home screens.
    icons: {
      icon: [
        { url: '/brand/favicon.svg', type: 'image/svg+xml' },
        { url: '/brand/favicon-48.png', sizes: '48x48', type: 'image/png' },
        { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
      ],
      apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
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
      className={`${golosText.variable} ${geologica.variable} ${geistMono.variable}`}
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
