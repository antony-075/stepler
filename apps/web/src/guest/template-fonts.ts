import type { FontId } from '@stepler/contracts';
import localFont from 'next/font/local';

// The guest page templates' fonts (ADR 0017): the committed woff2 files in apps/templates/fonts
// (latin + cyrillic, OFL; CREDITS.md there). next/font needs literal options, hence one call per
// family. Nothing is preloaded: a file downloads only when the template root carries its class
// (`fontVariables`) and text uses it, so a page pays for one or two families at most. The build
// never fetches fonts over the network. `@stepler/templates/core` FONTS lists the same files.
// next/font names each CSS family after its variable, so the four families with a Reserved Font
// Name are declared under their Stepler names (CREDITS.md: a subset may not use an RFN).

type TemplateFont = {
  /** The CSS variable templates read the family stack from. */
  variable: `--font-tpl-${FontId}`;
  /** The class that defines it; empty when the page already defines it (Geologica). */
  className: string;
};

const manrope = localFont({
  src: '../../../templates/fonts/manrope.woff2',
  weight: '200 800',
  variable: '--font-tpl-manrope',
  display: 'swap',
  preload: false,
});
const unbounded = localFont({
  src: '../../../templates/fonts/unbounded.woff2',
  weight: '200 900',
  variable: '--font-tpl-unbounded',
  display: 'swap',
  preload: false,
});
const steplerDisplaySerif = localFont({
  src: '../../../templates/fonts/playfair-display.woff2',
  weight: '400 900',
  variable: '--font-tpl-playfair-display',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
const cormorant = localFont({
  src: '../../../templates/fonts/cormorant.woff2',
  weight: '300 700',
  variable: '--font-tpl-cormorant',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
const steplerBookSerif = localFont({
  src: '../../../templates/fonts/lora.woff2',
  weight: '400 700',
  variable: '--font-tpl-lora',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
const nunito = localFont({
  src: '../../../templates/fonts/nunito.woff2',
  weight: '200 1000',
  variable: '--font-tpl-nunito',
  display: 'swap',
  preload: false,
});
const rubik = localFont({
  src: '../../../templates/fonts/rubik.woff2',
  weight: '300 900',
  variable: '--font-tpl-rubik',
  display: 'swap',
  preload: false,
});
const montserratAlternates = localFont({
  src: [
    { path: '../../../templates/fonts/montserrat-alternates-500.woff2', weight: '500' },
    { path: '../../../templates/fonts/montserrat-alternates-700.woff2', weight: '700' },
  ],
  variable: '--font-tpl-montserrat-alternates',
  display: 'swap',
  preload: false,
});
const steplerRounded = localFont({
  src: '../../../templates/fonts/comfortaa.woff2',
  weight: '300 700',
  variable: '--font-tpl-comfortaa',
  display: 'swap',
  preload: false,
});
const steplerTextSerif = localFont({
  src: [
    { path: '../../../templates/fonts/pt-serif-400.woff2', weight: '400' },
    { path: '../../../templates/fonts/pt-serif-700.woff2', weight: '700' },
  ],
  variable: '--font-tpl-pt-serif',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
const golosText = localFont({
  src: '../../../templates/fonts/golos-text.woff2',
  weight: '400 900',
  variable: '--font-tpl-golos-text',
  display: 'swap',
  preload: false,
});

const font = (id: FontId, loaded: { variable: string }): TemplateFont => ({
  variable: `--font-tpl-${id}`,
  className: loaded.variable,
});

export const TEMPLATE_FONTS: Record<FontId, TemplateFont> = {
  // Already defined on <html> (app/fonts.ts, for the templates); @stepler/templates/styles.css
  // maps --font-tpl-geologica to it, so it costs nothing extra.
  geologica: { variable: '--font-tpl-geologica', className: '' },
  manrope: font('manrope', manrope),
  unbounded: font('unbounded', unbounded),
  'playfair-display': font('playfair-display', steplerDisplaySerif),
  cormorant: font('cormorant', cormorant),
  lora: font('lora', steplerBookSerif),
  nunito: font('nunito', nunito),
  rubik: font('rubik', rubik),
  'montserrat-alternates': font('montserrat-alternates', montserratAlternates),
  comfortaa: font('comfortaa', steplerRounded),
  'pt-serif': font('pt-serif', steplerTextSerif),
  'golos-text': font('golos-text', golosText),
};

/** The template root's classes for the fonts it uses (heading and body), each once. */
export function fontVariables(...ids: FontId[]): string {
  return [...new Set(ids.map((id) => TEMPLATE_FONTS[id].className))]
    .filter((className) => className !== '')
    .join(' ');
}
