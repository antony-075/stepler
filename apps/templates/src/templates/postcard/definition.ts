import type { TemplateDefinition } from '../../core/definition.ts';

/**
 * T4 «Листівка» (plan Appendix A): an airmail postcard. Dotted paper in one of five soft
 * colours, a cream card in an airmail border, the cover as a taped polaroid, a postmark with
 * the count, stamps for buttons; Comfortaa headings over Nunito, the red stamp as the accent.
 * The card sets its own text alignment and radii (locks to confirm at the PR K review). Light
 * only.
 */
export const postcard: TemplateDefinition = {
  id: 'postcard',
  version: 1,
  scheme: 'light',
  bodyFont: 'nunito',
  defaults: {
    background: { kind: 'solid', color: '#C9D7E8' },
    accent: '#B3303B',
    headingFont: 'comfortaa',
    coverPlacement: 'top',
    // Centred, as the card is drawn on phones (owner remark 111 unlocked it).
    align: 'center',
    corners: 'soft',
  },
  options: {
    backgroundKinds: ['solid'],
    swatches: ['#C9D7E8', '#E3D9C6', '#D9E4D4', '#EAD7D7', '#D8D3E6'],
    gradients: [],
    imageDim: { min: 0, max: 0 },
    backgroundImageSource: 'own',
    coverPlacements: ['top', 'none'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: '#24304F',
    body: '#3A4562',
    muted: '#4F5A73',
    link: '#2E4E8F',
    // The card, the polaroids and the sticky notes.
    surfaces: ['#FFFCF5', '#FFFFFF', '#FFF0B3'],
    veil: '#C9D7E8',
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
