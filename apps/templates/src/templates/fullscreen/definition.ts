import type { TemplateDefinition } from '../../core/definition.ts';

/**
 * T2 «На весь екран» (plan Appendix A, [D5]): the cover is the whole first screen and the
 * background (image only, the cover itself), a dark sheet slides over it, Manrope with the
 * apricot accent. Dark only.
 */
export const fullscreen: TemplateDefinition = {
  id: 'fullscreen',
  version: 1,
  scheme: 'dark',
  bodyFont: 'manrope',
  defaults: {
    background: { kind: 'image', dim: 45 },
    accent: '#F2A65A',
    headingFont: 'manrope',
    coverPlacement: 'full',
    align: 'start',
    corners: 'soft',
  },
  options: {
    backgroundKinds: ['image'],
    swatches: [],
    gradients: [],
    // The hero's dimming; the text band under the title has its own scrim (`--tpl-text-band`).
    imageDim: { min: 20, max: 80 },
    backgroundImageSource: 'cover',
    coverPlacements: ['full'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: '#F3EFE9',
    body: '#D9D3CA',
    muted: '#ADA69D',
    link: '#F2A65A',
    // The sheet, the action card, the empty box and the wish tile.
    surfaces: ['#1B1917', '#24211E', '#221F1C', '#2E2620'],
    veil: '#0E0B09',
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
