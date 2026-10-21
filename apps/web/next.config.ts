import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** No plugins, no `<base>` hijack; framing is set per route below. */
const CSP_BASE = "base-uri 'self'; object-src 'none'";

/**
 * Every response: no MIME sniffing, no framing by other sites (clickjacking), only the origin as
 * a cross-site Referer, HTTPS remembered for a year, and the device features the app never uses
 * switched off. A full script CSP is not here: Next's inline scripts need per-request nonces.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: `frame-ancestors 'none'; ${CSP_BASE}` },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

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
    // A later rule overrides an earlier one for the same header, so the route rules follow.
    return Promise.resolve([
      { source: '/:path*', headers: SECURITY_HEADERS },
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
        // And the account deletion token (ADR 0020).
        source: '/delete-account',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // The editor's live preview (ADR 0017): framed by the editor on this origin only.
        source: '/preview/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: `frame-ancestors 'self'; ${CSP_BASE}` },
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
