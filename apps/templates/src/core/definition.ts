import {
  themeSettingsSchema,
  type Align,
  type BackgroundKind,
  type Corners,
  type CoverPlacement,
  type FontId,
  type Hex,
  type ThemeSettings,
} from '@stepler/contracts';
import type { z } from 'zod';

export type GradientOption = {
  /** The id `background.preset` stores, e.g. `mist`. */
  readonly id: string;
  readonly stops: readonly [Hex, Hex];
  /** CSS degrees; 180 is top to bottom. */
  readonly angle: number;
};

/**
 * One guest page template as data (plan Appendix A): what it looks like by default, which
 * tweaks it allows, and the colours its text is derived from. The React side adds its `Layout`
 * and `Thumbnail` (`@stepler/templates/react`). The API validates drafts with this alone.
 */
export interface TemplateDefinition {
  /** A stable slug, also the template's folder name and its `data-template` value. */
  readonly id: string;
  /** Bumped when the settings shape changes; `migrate` upgrades older stored settings. */
  readonly version: number;
  /** Fixed per template [D5]: a template with an admin-chosen background cannot be inverted. */
  readonly scheme: 'light' | 'dark';
  /** Body text stays in this face; the font tweak sets headings only [D4]. */
  readonly bodyFont: FontId;
  readonly defaults: ThemeSettings;
  readonly options: {
    readonly backgroundKinds: readonly BackgroundKind[];
    /** Background colours offered (no free colour for the background); the first is the default. */
    readonly swatches: readonly Hex[];
    readonly gradients: readonly GradientOption[];
    /** The veil over a background image, in percent; `min` keeps text readable on any image. */
    readonly imageDim: { readonly min: number; readonly max: number };
    /** `cover`: the background image is the cover itself (T2), not an upload of its own. */
    readonly backgroundImageSource: 'own' | 'cover';
    readonly coverPlacements: readonly CoverPlacement[];
    readonly aligns: readonly Align[];
    readonly corners: readonly Corners[];
  };
  /** The source colours; the tokens derive readable versions of them (`themeTokens`). */
  readonly palette: {
    /** Headings. */
    readonly text: Hex;
    /** Running text. */
    readonly body: Hex;
    /** Secondary lines (counts, captions). */
    readonly muted: Hex;
    /** Cards, sheets and bars the text also sits on. */
    readonly surfaces: readonly Hex[];
    /** The colour laid over a background image (and shown while it loads). */
    readonly veil: Hex;
    /** Text set directly on a picture (T2's hero). */
    readonly onImageText: Hex;
  };
  /** Upgrades settings stored under `fromVersion`; the result is validated again. */
  migrate(fromVersion: number, settings: unknown): unknown;
}

/** The settings groups a template can lock to one value. */
export type LockableSetting = 'backgroundKind' | 'coverPlacement' | 'align' | 'corners';

const OPTION_OF = {
  backgroundKind: 'backgroundKinds',
  coverPlacement: 'coverPlacements',
  align: 'aligns',
  corners: 'corners',
} as const satisfies Record<LockableSetting, keyof TemplateDefinition['options']>;

/** True when the template allows exactly one value: the editor shows it with the reason. */
export function isLocked(def: TemplateDefinition, key: LockableSetting): boolean {
  return def.options[OPTION_OF[key]].length === 1;
}

/**
 * The contract's `themeSettingsSchema` narrowed to what `def` allows: background kind, colour,
 * gradient and dimming range, cover placement, alignment and corners. Accent and heading font
 * are free within the contract (any colour stays readable [D3]; every font has Cyrillic).
 * Issues carry paths like `['background', 'color']`, under the request's `settings`.
 */
export function settingsSchemaFor(def: TemplateDefinition): z.ZodType<ThemeSettings> {
  const { options } = def;
  return themeSettingsSchema.superRefine((settings, ctx) => {
    const notAllowed = (path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', path, message: `Not allowed in the ${def.id} template` });
    const { background } = settings;
    if (!options.backgroundKinds.includes(background.kind)) notAllowed(['background', 'kind']);
    else if (background.kind === 'solid' && !options.swatches.includes(background.color)) {
      notAllowed(['background', 'color']);
    } else if (
      background.kind === 'gradient' &&
      !options.gradients.some((gradient) => gradient.id === background.preset)
    ) {
      notAllowed(['background', 'preset']);
    } else if (
      background.kind === 'image' &&
      (background.dim < options.imageDim.min || background.dim > options.imageDim.max)
    ) {
      notAllowed(['background', 'dim']);
    }
    if (!options.coverPlacements.includes(settings.coverPlacement)) notAllowed(['coverPlacement']);
    if (!options.aligns.includes(settings.align)) notAllowed(['align']);
    if (!options.corners.includes(settings.corners)) notAllowed(['corners']);
  });
}
