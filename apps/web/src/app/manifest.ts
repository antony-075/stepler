import type { MetadataRoute } from 'next';

/**
 * The web app manifest (`/manifest.webmanifest`, linked by Next): the brand's name, colours and
 * home-screen icons (public/brand). From the owner's `site.webmanifest`, with the refined icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stepler',
    short_name: 'Stepler',
    start_url: '/app',
    display: 'standalone',
    theme_color: '#FFFFFF',
    background_color: '#FFFFFF',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
