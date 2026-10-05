import type { TemplateDefinition } from '../../core/definition.ts';

/**
 * T6 «Мінімалізм» (plan Appendix A): white space and type. Golos Text, a large medium-weight
 * title, hairline rules, one blue action and an underlined text button. A solid background
 * only (lock to confirm at the PR K review); no cover by default, or one above or beside the
 * title. Light only.
 */
export const minimal: TemplateDefinition = {
  id: 'minimal',
  version: 1,
  scheme: 'light',
  bodyFont: 'golos-text',
  defaults: {
    background: { kind: 'solid', color: '#FFFFFF' },
    accent: '#2443D0',
    headingFont: 'golos-text',
    coverPlacement: 'none',
    align: 'start',
    corners: 'soft',
  },
  options: {
    backgroundKinds: ['solid'],
    swatches: ['#FFFFFF', '#F7F7F5', '#F4F6FA', '#FAF7F2', '#F5F5F7'],
    gradients: [],
    imageDim: { min: 0, max: 0 },
    backgroundImageSource: 'own',
    coverPlacements: ['none', 'top', 'side'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: '#15171A',
    body: '#3D4146',
    muted: '#63676C',
    link: '#15171A',
    // The page and the wish tile.
    surfaces: ['#FFFFFF', '#EEF1FC'],
    veil: '#FFFFFF',
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
