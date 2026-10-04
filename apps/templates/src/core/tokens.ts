import type { Corners, Hex, ThemeSettings } from '@stepler/contracts';
import {
  bestTextOn,
  composite,
  contrastRatio,
  MIN_RATIO,
  minVeil,
  readableOn,
  relativeLuminance,
  withAlpha,
} from './contrast.js';
import type { TemplateDefinition } from './definition.js';

/** CSS custom properties a template root carries (`GuestTemplateRoot`), all `--tpl-*`. */
export type ThemeTokens = Record<`--tpl-${string}`, string>;

/** Radii per corners setting, in px (plan Appendix B): tile, button, card, bar. */
const RADII: Record<Corners, { tile: number; btn: number; card: number; bar: number }> = {
  sharp: { tile: 2, btn: 4, card: 4, bar: 8 },
  soft: { tile: 8, btn: 10, card: 12, bar: 18 },
  round: { tile: 14, btn: 999, card: 22, bar: 30 },
};

const ACCENT_SOFT_ALPHA = 0.22;
const ACCENT_GLOW_ALPHA = 0.55;

/** The veil over a background image: the admin's dimming, never below what keeps text readable. */
function veilAlpha(def: TemplateDefinition, dim: number): number {
  return Math.max(dim / 100, minVeil(def.palette.text, def.palette.veil));
}

/**
 * What the page background can be under text: the solid colour, both gradient stops, or for an
 * image the veil over pure white and over pure black (the worst cases).
 */
function pageBackgrounds(def: TemplateDefinition, settings: ThemeSettings): Hex[] {
  const { background } = settings;
  switch (background.kind) {
    case 'solid':
      return [background.color];
    case 'gradient': {
      const gradient = def.options.gradients.find((option) => option.id === background.preset);
      return gradient === undefined ? [def.palette.veil] : [...gradient.stops];
    }
    case 'image': {
      const alpha = veilAlpha(def, background.dim);
      return [
        composite(def.palette.veil, alpha, '#FFFFFF'),
        composite(def.palette.veil, alpha, '#000000'),
      ];
    }
  }
}

/** Every surface text can sit on: the page background plus the template's cards and bars. */
function effectiveBackgrounds(def: TemplateDefinition, settings: ThemeSettings): Hex[] {
  return [...pageBackgrounds(def, settings), ...def.palette.surfaces];
}

/**
 * The CSS variables for one template with one set of settings. Text colours are the palette's,
 * derived until they read at ≥ 4.5:1 on every background they can meet [D3]; the accent is kept
 * as the fill, with its label (`--tpl-on-accent`) and its text form (`--tpl-accent-text`)
 * derived the same way.
 */
export function themeTokens(def: TemplateDefinition, settings: ThemeSettings): ThemeTokens {
  const backgrounds = effectiveBackgrounds(def, settings);
  const { background, accent } = settings;
  const radii = RADII[settings.corners];
  const gradient =
    background.kind === 'gradient'
      ? def.options.gradients.find((option) => option.id === background.preset)
      : undefined;
  return {
    '--tpl-bg':
      background.kind === 'solid' ? background.color : (gradient?.stops[0] ?? def.palette.veil),
    '--tpl-bg-image-veil':
      background.kind === 'image' ? String(veilAlpha(def, background.dim)) : '0',
    '--tpl-gradient':
      gradient === undefined
        ? 'none'
        : `linear-gradient(${gradient.angle}deg, ${gradient.stops[0]}, ${gradient.stops[1]})`,
    '--tpl-text': readableOn(def.palette.text, backgrounds),
    '--tpl-body': readableOn(def.palette.body, backgrounds),
    '--tpl-muted': readableOn(def.palette.muted, backgrounds),
    '--tpl-accent': accent,
    '--tpl-on-accent': bestTextOn(accent),
    '--tpl-accent-text': readableOn(accent, backgrounds),
    '--tpl-accent-soft': withAlpha(accent, ACCENT_SOFT_ALPHA),
    '--tpl-accent-glow': withAlpha(accent, ACCENT_GLOW_ALPHA),
    '--tpl-radius-tile': `${radii.tile}px`,
    '--tpl-radius-btn': `${radii.btn}px`,
    '--tpl-radius-card': `${radii.card}px`,
    '--tpl-radius-bar': `${radii.bar}px`,
    '--tpl-align': settings.align,
  };
}

export type AccentContrast = {
  /** The accent against the template's page background (the worst of its colours). */
  ratio: number;
  /** ≥ 4.5 `good`, ≥ 3 `small-text`, below `merges`. */
  level: 'good' | 'small-text' | 'merges';
  /** Which way a more readable accent lies: `lighter` on a dark background. */
  direction: 'lighter' | 'darker';
};

/** The editor's hint under the accent swatches (plan Appendix B). */
export function accentContrast(def: TemplateDefinition, settings: ThemeSettings): AccentContrast {
  const backgrounds = pageBackgrounds(def, settings);
  const ratio = Math.min(...backgrounds.map((bg) => contrastRatio(settings.accent, bg)));
  const luminance =
    backgrounds.reduce((sum, bg) => sum + relativeLuminance(bg), 0) / backgrounds.length;
  return {
    ratio,
    level: ratio >= MIN_RATIO ? 'good' : ratio >= 3 ? 'small-text' : 'merges',
    direction: luminance < 0.2 ? 'lighter' : 'darker',
  };
}

/** A text token below 4.5:1: only a broken template definition can cause it. */
export class ContrastError extends Error {
  constructor(
    readonly token: string,
    readonly ratio: number,
  ) {
    super(`${token} reads at ${ratio.toFixed(2)}:1, below ${MIN_RATIO}:1`);
    this.name = 'ContrastError';
  }
}

/**
 * Throws `ContrastError` when a derived text token misses 4.5:1 on any background it can meet,
 * or the accent's label misses it on the accent. The API's `THEME_CONTRAST_TOO_LOW` safety net.
 */
export function assertReadable(def: TemplateDefinition, settings: ThemeSettings): void {
  const tokens = themeTokens(def, settings);
  const backgrounds = effectiveBackgrounds(def, settings);
  const check = (token: keyof ThemeTokens, against: readonly Hex[]) => {
    const ratio = Math.min(...against.map((bg) => contrastRatio(tokens[token] as Hex, bg)));
    if (ratio < MIN_RATIO) throw new ContrastError(token, ratio);
  };
  for (const token of ['--tpl-text', '--tpl-body', '--tpl-muted', '--tpl-accent-text'] as const) {
    check(token, backgrounds);
  }
  check('--tpl-on-accent', [settings.accent]);
}
