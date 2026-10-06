import localFont from 'next/font/local';

// The interface fonts, committed in packages/ui/src/fonts with their OFL licences (ADR 0015).
// Local files: the build never fetches fonts over the network. Storybook loads the same files
// with @font-face (packages/ui/src/fonts/fonts.css).

/** Golos Text, variable wght 400–900, latin + cyrillic: all interface text (V1 «Графіт»). */
export const golosText = localFont({
  src: '../../../../packages/ui/src/fonts/golos-text-wght.woff2',
  weight: '400 900',
  style: 'normal',
  variable: '--font-golos',
  display: 'swap',
});

/**
 * Geologica, variable wght 100–900 and SHRP 0–100: no longer an interface font, but the guest
 * page templates read `--font-geologica` (@stepler/templates/styles.css), so it stays defined.
 * Not preloaded: the file downloads only on a template page that uses it.
 */
export const geologica = localFont({
  src: '../../../../packages/ui/src/fonts/geologica-wght-shrp.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-geologica',
  display: 'swap',
  preload: false,
});

/** Geist Mono, variable wght 100–900, latin + cyrillic: data only (numbers, times, sizes). */
export const geistMono = localFont({
  src: '../../../../packages/ui/src/fonts/geist-mono-wght.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-geist-mono',
  display: 'swap',
  // Data text is small and never the first thing to read; do not compete with Golos Text.
  preload: false,
  // The generated fallback would size Arial, a proportional face; --font-mono falls back to the
  // system monospace instead.
  adjustFontFallback: false,
});
