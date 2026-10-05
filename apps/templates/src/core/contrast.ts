import type { Hex } from '@stepler/contracts';

/**
 * WCAG 2.x contrast maths for the guest page themes [D3]: the admin's colours are kept as fills,
 * and every text colour is derived until it reads at ≥ 4.5:1 on every surface it can sit on.
 * Colours are `#RRGGBB` (the contract's spelling); results are uppercase `#RRGGBB` too.
 */

/** WCAG AA for body text. Every text token of every template reaches it by construction. */
export const MIN_RATIO = 4.5;

const BLACK: Hex = '#000000';
const WHITE: Hex = '#FFFFFF';

type Rgb = readonly [number, number, number];

function toRgb(hex: Hex): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex([r, g, b]: Rgb): Hex {
  const channel = (c: number) =>
    Math.min(255, Math.max(0, Math.round(c)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** The colour as CSS `rgb(r g b / alpha)`, for the soft and glow tints of the accent. */
export function withAlpha(hex: Hex, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** An sRGB channel (0–255) in linear light. */
function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: Hex): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio, 1 to 21, symmetric. */
export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `color` at `alpha` (0–1) over an opaque `base`, as the browser blends it (sRGB). */
export function composite(color: Hex, alpha: number, base: Hex): Hex {
  const top = toRgb(color);
  const bottom = toRgb(base);
  const mix = (i: 0 | 1 | 2) => top[i] * alpha + bottom[i] * (1 - alpha);
  return toHex([mix(0), mix(1), mix(2)]);
}

/** The lowest ratio `color` has against any of `backgrounds`. */
function worstRatio(color: Hex, backgrounds: readonly Hex[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

/**
 * The label colour on a filled `fill` (a button in the accent): the better of `candidates`, or
 * pure black or white when neither reaches 4.5:1. One of black and white always does (the worst
 * case, a fill of luminance ≈ 0.18, still gives ≈ 4.58:1).
 */
export function bestTextOn(fill: Hex, candidates: readonly Hex[] = ['#141614', WHITE]): Hex {
  const ranked = [...candidates].sort((a, b) => contrastRatio(b, fill) - contrastRatio(a, fill));
  const best = ranked[0];
  if (best !== undefined && contrastRatio(best, fill) >= MIN_RATIO) return best;
  return contrastRatio(BLACK, fill) >= contrastRatio(WHITE, fill) ? BLACK : WHITE;
}

/**
 * The luminance where black and white text read equally well (≈ 0.179): above it, darkening
 * a colour gains contrast; below it, lightening does.
 */
const PIVOT = Math.sqrt(1.05 * 0.05) - 0.05;

/**
 * `color` itself when it reads at `min` against every background, else `color` mixed toward
 * black (light backgrounds) or white (dark ones) in 2 % steps until it does. When the
 * backgrounds disagree so much that no mix passes, the better of black and white.
 */
export function readableOn(color: Hex, backgrounds: readonly Hex[], min = MIN_RATIO): Hex {
  if (backgrounds.length === 0 || worstRatio(color, backgrounds) >= min) return color;
  const mean =
    backgrounds.reduce((sum, background) => sum + relativeLuminance(background), 0) /
    backgrounds.length;
  const target = mean > PIVOT ? BLACK : WHITE;
  for (let step = 1; step <= 50; step += 1) {
    const mixed = composite(target, step / 50, color);
    if (worstRatio(mixed, backgrounds) >= min) return mixed;
  }
  return worstRatio(BLACK, backgrounds) >= worstRatio(WHITE, backgrounds) ? BLACK : WHITE;
}

/**
 * The least veil (alpha, 0.01 steps) of `veil` over an image so that `text` reads at 4.5:1
 * whatever the image is: checked over pure white and pure black, the two extremes. 1 when even
 * an opaque veil is not enough (a broken palette).
 */
export function minVeil(text: Hex, veil: Hex): number {
  for (let step = 0; step <= 100; step += 1) {
    const alpha = step / 100;
    if (
      contrastRatio(text, composite(veil, alpha, WHITE)) >= MIN_RATIO &&
      contrastRatio(text, composite(veil, alpha, BLACK)) >= MIN_RATIO
    ) {
      return alpha;
    }
  }
  return 1;
}
