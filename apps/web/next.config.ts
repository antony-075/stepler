import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  // Monorepo root, so the standalone output traces workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  // packages/ui ships TypeScript sources.
  transpilePackages: ['@stepler/ui'],
  // The landing's photos (static imports): AVIF first, WebP as the fallback.
  images: { formats: ['image/avif', 'image/webp'] },
  headers() {
    return Promise.resolve([
      {
        // The magic-link token is in this page's URL; never leak it as a Referer.
        source: '/auth/verify',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // A guest link's token is in the URL (spec §4): no Referer, and never indexed.
        source: '/g/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ]);
  },
};

export default withNextIntl(config);
