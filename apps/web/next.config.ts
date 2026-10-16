import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  // Monorepo root, so the standalone output traces workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  // packages/ui and the templates' React entry ship TypeScript sources.
  transpilePackages: ['@stepler/ui', '@stepler/templates'],
  // The landing's photos (static imports): AVIF first, WebP as the fallback; 90 for the event
  // photos (their sources are only 960px wide, so no extra softness on top), 75 by default.
  images: { formats: ['image/avif', 'image/webp'], qualities: [75, 90] },
  headers() {
    return Promise.resolve([
      {
        // The e-mailed confirmation token is in this page's URL; never leak it as a Referer.
        source: '/auth/verify',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // So is the password reset token (ADR 0019).
        source: '/reset-password',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // The editor's live preview (ADR 0017): framed by the editor on this origin only.
        source: '/preview/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Robots-Tag', value: 'noindex' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
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
