import type { TemplateDefinition } from './definition.ts';
import { classic } from '../templates/classic/definition.ts';

/**
 * A stand-in for T2 «На весь екран» (plan Appendix A) until PR K registers it: the cover is the
 * background image, shown full screen; tests only.
 */
export const fullscreenLike: TemplateDefinition = {
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
    surfaces: ['#1B1917', '#24211E', '#221F1C'],
    veil: '#0E0B09',
    onImageText: '#FFFFFF',
  },
  migrate: (_fromVersion, settings) => settings,
};

/** `classic` at version 2, where v1 stored `alignment` instead of `align`; tests only. */
export const classicV2: TemplateDefinition = {
  ...classic,
  version: 2,
  migrate: (fromVersion, settings) => {
    if (fromVersion !== 1 || typeof settings !== 'object' || settings === null) return settings;
    const { alignment, ...rest } = settings as Record<string, unknown>;
    return { ...rest, align: alignment };
  },
};
