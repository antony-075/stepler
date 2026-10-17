// Real Stepler screens for the landing, captured from the running app by `pnpm landing:media`
// (e2e/media): a demo account, six collections with CC0 photos, the real guest flow. One set per
// language in public/landing/screens/{uk,en}; the tool writes manifest.json with every file's
// pixel size, so the page reserves the space (no layout shift) and never asks for a file that is
// not there: a screen missing in a language falls back to the Ukrainian one.
import manifest from '../../public/landing/screens/manifest.json';
import type { TemplateKey } from './templates';

export type ScreenLocale = 'uk' | 'en';

export type PhoneScreen = `guest-${TemplateKey}` | 'guest-frames' | 'guest-upload' | 'guest-wish';

export type DesktopScreen =
  'admin-dashboard' | 'admin-collection' | 'admin-share' | 'admin-new' | 'admin-editor';

export interface Screen {
  src: string;
  width: number;
  height: number;
  /**
   * A phone screen's system bars: the colour at the top of the page and the text that reads on
   * it, as Safari tints them (the editor's preview does the same, `--tpl-bg`).
   */
  bar?: { background: string; foreground: 'dark' | 'light' };
}

/** Sampled from the top edge of each phone still (the same in both languages). */
const BARS: Record<PhoneScreen, NonNullable<Screen['bar']>> = {
  'guest-classic': { background: '#f1f1f1', foreground: 'dark' },
  'guest-fullscreen': { background: '#0f0f0f', foreground: 'light' },
  'guest-journal': { background: '#f0ebdf', foreground: 'dark' },
  'guest-postcard': { background: '#cad7e9', foreground: 'dark' },
  'guest-party': { background: '#272c1d', foreground: 'light' },
  'guest-minimal': { background: '#ffffff', foreground: 'dark' },
  'guest-frames': { background: '#cad7e9', foreground: 'dark' },
  'guest-upload': { background: '#747b86', foreground: 'light' },
  'guest-wish': { background: '#747b86', foreground: 'light' },
};

const SIZES: Record<string, { width: number; height: number } | undefined> = manifest;

/** The screens are always captured in Ukrainian first; it is the fallback for every other one. */
const FALLBACK: ScreenLocale = 'uk';

/** Fixed by the capture tool, for a screen the manifest does not list yet. */
const PHONE = { width: 780, height: 1688 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

export function screenLocale(locale: string): ScreenLocale {
  return locale === 'en' ? 'en' : 'uk';
}

function screen(
  locale: ScreenLocale,
  name: string,
  fallbackSize: { width: number; height: number },
): Screen {
  const own = `${locale}/${name}.webp`;
  const file = SIZES[own] === undefined ? `${FALLBACK}/${name}.webp` : own;
  return { src: `/landing/screens/${file}`, ...(SIZES[file] ?? fallbackSize) };
}

export function phoneScreen(locale: ScreenLocale, name: PhoneScreen): Screen {
  return { ...screen(locale, name, PHONE), bar: BARS[name] };
}

export function desktopScreen(locale: ScreenLocale, name: DesktopScreen): Screen {
  return screen(locale, name, DESKTOP);
}
