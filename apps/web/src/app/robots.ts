import type { MetadataRoute } from 'next';

/**
 * `/robots.txt`: the public pages (the landing, /pricing, /legal, sign-in and registration) may be
 * crawled; the admin app, the operator console, guest links (their token is in the URL), the
 * editor's preview, the API and the e-mailed token pages may not. Guest links and the preview
 * also answer `X-Robots-Tag: noindex` (next.config.ts). Without SEARCH_INDEXING=on (staging, local)
 * every page is `noindex` by its metadata (app/layout.tsx), so crawling it indexes nothing. No sitemap line: it needs the absolute
 * production URL, and the domain is not confirmed yet.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/app',
        '/ops',
        '/g/',
        '/preview/',
        '/api/',
        '/auth/',
        '/reset-password',
        '/delete-account',
        '/accept-terms',
      ],
    },
  };
}
