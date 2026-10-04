import type { ThemeSettings } from '@stepler/contracts';
import type { TemplateDefinition } from './definition.js';

/**
 * The settings after switching to `next` (plan "Template switch"): accent, background and
 * heading font reset to `next`'s defaults (each template's colours are designed together);
 * alignment, corners and cover placement are kept when `next` allows them. Cover, background
 * image and welcome live outside the settings and are kept by the caller.
 */
export function applyTemplate(next: TemplateDefinition, current: ThemeSettings): ThemeSettings {
  const { defaults, options } = next;
  return {
    ...defaults,
    coverPlacement: options.coverPlacements.includes(current.coverPlacement)
      ? current.coverPlacement
      : defaults.coverPlacement,
    align: options.aligns.includes(current.align) ? current.align : defaults.align,
    corners: options.corners.includes(current.corners) ? current.corners : defaults.corners,
  };
}
