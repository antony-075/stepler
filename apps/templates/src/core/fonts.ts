import type { FontId } from '@stepler/contracts';

export type FontFile = {
  /** In `apps/templates/fonts/`. */
  readonly file: string;
  /** A CSS `font-weight`: a range for a variable file, one weight for a static one. */
  readonly weight: string;
  readonly style: 'normal';
};

export type FontEntry = {
  /** The `@font-face` family name (fonts.css). Reserved names are replaced (CREDITS.md). */
  readonly family: string;
  readonly files: readonly FontFile[];
  readonly fallback: 'sans-serif' | 'serif';
};

const variable = (file: string, weight: string): readonly FontFile[] => [
  { file, weight, style: 'normal' },
];

/**
 * The twelve curated fonts as committed woff2 files (latin + cyrillic, OFL; fonts/CREDITS.md).
 * The web app mirrors this map with literal `next/font/local` calls (template-fonts.ts).
 */
export const FONTS: Record<FontId, FontEntry> = {
  geologica: {
    family: 'Geologica',
    files: variable('geologica.woff2', '100 900'),
    fallback: 'sans-serif',
  },
  manrope: {
    family: 'Manrope',
    files: variable('manrope.woff2', '200 800'),
    fallback: 'sans-serif',
  },
  unbounded: {
    family: 'Unbounded',
    files: variable('unbounded.woff2', '200 900'),
    fallback: 'sans-serif',
  },
  'playfair-display': {
    family: 'Stepler Display Serif',
    files: variable('playfair-display.woff2', '400 900'),
    fallback: 'serif',
  },
  cormorant: {
    family: 'Cormorant',
    files: variable('cormorant.woff2', '300 700'),
    fallback: 'serif',
  },
  lora: {
    family: 'Stepler Book Serif',
    files: variable('lora.woff2', '400 700'),
    fallback: 'serif',
  },
  nunito: { family: 'Nunito', files: variable('nunito.woff2', '200 1000'), fallback: 'sans-serif' },
  rubik: { family: 'Rubik', files: variable('rubik.woff2', '300 900'), fallback: 'sans-serif' },
  'montserrat-alternates': {
    family: 'Montserrat Alternates',
    files: [
      { file: 'montserrat-alternates-500.woff2', weight: '500', style: 'normal' },
      { file: 'montserrat-alternates-700.woff2', weight: '700', style: 'normal' },
    ],
    fallback: 'sans-serif',
  },
  comfortaa: {
    family: 'Stepler Rounded',
    files: variable('comfortaa.woff2', '300 700'),
    fallback: 'sans-serif',
  },
  'pt-serif': {
    family: 'Stepler Text Serif',
    files: [
      { file: 'pt-serif-400.woff2', weight: '400', style: 'normal' },
      { file: 'pt-serif-700.woff2', weight: '700', style: 'normal' },
    ],
    fallback: 'serif',
  },
  'golos-text': {
    family: 'Golos Text',
    files: variable('golos-text.woff2', '400 900'),
    fallback: 'sans-serif',
  },
};

/** The CSS variable a font's family stack is in, on the template root. */
export function fontCssVar(id: FontId): `--font-tpl-${FontId}` {
  return `--font-tpl-${id}`;
}
