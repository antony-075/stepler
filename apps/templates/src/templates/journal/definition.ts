import type { TemplateDefinition } from '../../core/definition.ts';

/**
 * T3 «Журнал» (plan Appendix A): a printed wedding album. Warm paper, Cormorant headings over
 * Lora, the cover as a matted 3:4 print, burgundy. Text is always centred and the template
 * keeps its own paper radii; the owner confirms these locks at the PR K review. Light only.
 */
export const journal: TemplateDefinition = {
  id: 'journal',
  version: 1,
  scheme: 'light',
  bodyFont: 'lora',
  defaults: {
    background: { kind: 'solid', color: '#F1EADF' },
    accent: '#7A2E3A',
    headingFont: 'cormorant',
    coverPlacement: 'top',
    align: 'center',
    corners: 'sharp',
  },
  options: {
    backgroundKinds: ['solid', 'gradient'],
    swatches: ['#F1EADF', '#F4EEE4', '#FAF6EF', '#EFE6E6', '#E9ECE4'],
    gradients: [
      { id: 'linen', stops: ['#F1EADF', '#F4EEE4'], angle: 180 },
      { id: 'blush', stops: ['#F1EADF', '#EFE6E6'], angle: 180 },
      { id: 'sage', stops: ['#FAF6EF', '#E9ECE4'], angle: 180 },
    ],
    imageDim: { min: 0, max: 0 },
    backgroundImageSource: 'own',
    coverPlacements: ['top', 'none'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: '#2A211B',
    body: '#3D3129',
    muted: '#6A5A4E',
    link: '#7A2E3A',
    // The print's mat and the aside's paper, and the wish tile.
    surfaces: ['#FAF6EF', '#F5EFE6', '#EFE2DD'],
    veil: '#F1EADF',
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
