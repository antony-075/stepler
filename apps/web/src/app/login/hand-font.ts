import localFont from 'next/font/local';

/**
 * Caveat (OFL 1.1, licence next to the file), the landing's handwriting: only the three short
 * step labels of «Як це працює», never interface text. One static weight (500), latin + cyrillic
 * with Ukrainian і ї є ґ, kerning only (Caveat's contextual alternates would triple the file);
 * 32 KB. Built from google/fonts `ofl/caveat/Caveat[wght].ttf` with fontTools 4.60
 * (`varLib.instancer wght=500`, then `pyftsubset --layout-features=kern --flavor=woff2`).
 */
export const caveat = localFont({
  src: '../../assets/landing/fonts/caveat-500.woff2',
  weight: '500',
  style: 'normal',
  variable: '--font-hand',
  display: 'swap',
  // The labels are not the page's largest paint; the headline and the form come first.
  preload: false,
});
