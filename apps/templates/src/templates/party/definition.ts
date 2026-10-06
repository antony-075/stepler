import { minVeil } from '../../core/contrast.ts';
import type { TemplateDefinition } from '../../core/definition.ts';

const TEXT = '#F3EEFB';
const VEIL = '#110F15';

/**
 * T5 «Вечірка» (plan Appendix A, [D5]): a night out. Near-black backgrounds, a huge Unbounded
 * title, the cover as a round emblem with the title running around it, a lime accent that
 * glows, bento grids. Dark only.
 */
export const party: TemplateDefinition = {
  id: 'party',
  version: 1,
  scheme: 'dark',
  bodyFont: 'manrope',
  defaults: {
    background: { kind: 'solid', color: '#110F15' },
    accent: '#C5F04A',
    headingFont: 'unbounded',
    coverPlacement: 'top',
    align: 'start',
    corners: 'round',
  },
  options: {
    backgroundKinds: ['solid', 'gradient', 'image'],
    swatches: ['#110F15', '#15233B', '#2B1C14', '#0E2A20', '#2D1236'],
    gradients: [
      { id: 'night', stops: ['#110F15', '#2D1236'], angle: 180 },
      { id: 'ocean', stops: ['#110F15', '#15233B'], angle: 180 },
      { id: 'forest', stops: ['#0E2A20', '#110F15'], angle: 180 },
    ],
    // The least dimming that keeps the light heading readable over any picture (whole percent).
    imageDim: { min: Math.round(minVeil(TEXT, VEIL) * 100), max: 90 },
    backgroundImageSource: 'own',
    coverPlacements: ['top', 'none'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: TEXT,
    body: '#D9D1E6',
    muted: '#A99FBC',
    link: '#C9A6FF',
    // Tiles, the wish card and the empty box.
    surfaces: ['#2C2042', '#1F1830'],
    veil: VEIL,
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
