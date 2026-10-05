import type { FontId } from '@stepler/contracts';
import type { CSSProperties } from 'react';
import { resolveTheme } from '../core/resolve.ts';
import { themeTokens } from '../core/tokens.ts';
import type { GuestPageModel, TemplateActions, TemplateSlots } from './model.ts';
import { TEMPLATES } from './registry.ts';

type GuestTemplateRootProps = {
  /** As stored; an unknown or removed template renders the default one. */
  templateId: string;
  templateVersion: number;
  /** As stored; invalid settings render the template's defaults. */
  settings: unknown;
  /** The app's font classes for the heading and body faces (next/font in apps/web). */
  fontClassName: (heading: FontId, body: FontId) => string;
  model: GuestPageModel;
  actions: TemplateActions | null;
  slots: TemplateSlots;
  /** The editor's preview: rendered but not interactive. */
  inert?: boolean;
};

/**
 * Renders a guest page template: resolves the stored template and settings (never throws),
 * applies what the settings say about the model (no cover for placement `none`; a background
 * image only for an image background, the cover itself where the template says so), and
 * scopes the theme's CSS variables and fonts on one root element (`[data-template=…]`).
 * No hooks: the same markup can later render on the server.
 */
export function GuestTemplateRoot({
  templateId,
  templateVersion,
  settings: stored,
  fontClassName,
  model,
  actions,
  slots,
  inert,
}: GuestTemplateRootProps) {
  const { def, settings } = resolveTheme(templateId, templateVersion, stored);
  const template = TEMPLATES[def.id];
  if (template === undefined) throw new Error(`Template ${def.id} has no React side`);
  const cover = settings.coverPlacement === 'none' ? null : model.cover;
  const background =
    settings.background.kind !== 'image'
      ? null
      : def.options.backgroundImageSource === 'cover'
        ? model.cover
        : model.background;
  const style = {
    ...themeTokens(def, settings),
    ...(template.followsSystemScheme === true ? {} : { colorScheme: def.scheme }),
  } as CSSProperties;
  const { Layout } = template;
  return (
    <div
      data-template={def.id}
      {...(template.followsSystemScheme === true ? {} : { 'data-scheme': def.scheme })}
      style={style}
      className={fontClassName(settings.headingFont, def.bodyFont) || undefined}
      inert={inert}
    >
      <Layout
        model={{ ...model, cover, background }}
        actions={actions}
        slots={slots}
        settings={settings}
        def={def}
      />
    </div>
  );
}
