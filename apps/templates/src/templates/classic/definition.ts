import { minVeil } from '../../core/contrast.ts';
import type { TemplateDefinition } from '../../core/definition.ts';

const TEXT = '#141614';
const VEIL = '#F0F1EE';

/** T1 «Класика» (plan Appendix A): the light table, a white aside, Geologica, the pencil. */
export const classic: TemplateDefinition = {
  id: 'classic',
  version: 1,
  scheme: 'light',
  bodyFont: 'geologica',
  defaults: {
    background: { kind: 'solid', color: '#F0F1EE' },
    accent: '#B83E26',
    headingFont: 'geologica',
    coverPlacement: 'top',
    align: 'start',
    corners: 'soft',
  },
  options: {
    backgroundKinds: ['solid', 'gradient', 'image'],
    swatches: ['#F0F1EE', '#FFFFFF', '#EFE8DD', '#E4EAEE', '#ECE6F0'],
    gradients: [
      { id: 'mist', stops: ['#F0F1EE', '#E4EAEE'], angle: 180 },
      { id: 'sand', stops: ['#F0F1EE', '#EFE8DD'], angle: 180 },
      { id: 'lilac', stops: ['#FFFFFF', '#ECE6F0'], angle: 180 },
    ],
    // The least dimming that keeps the heading colour readable over any picture. `minVeil` is a
    // whole percent already; rounding only drops float noise (0.53 * 100 = 53.000000000000004).
    imageDim: { min: Math.round(minVeil(TEXT, VEIL) * 100), max: 90 },
    backgroundImageSource: 'own',
    coverPlacements: ['top', 'none'],
    aligns: ['start', 'center'],
    corners: ['sharp', 'soft', 'round'],
  },
  palette: {
    text: TEXT,
    body: '#3B3E39',
    muted: '#5A5D58',
    link: '#5A4A8C',
    // The aside and the wish tile, which text and the accent's text form also sit on.
    surfaces: ['#FFFFFF', '#FBECE8'],
    veil: VEIL,
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};
