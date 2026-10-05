import type { FontId } from '@stepler/contracts';
import type { CSSProperties } from 'react';
import { resolveTheme } from '../core/resolve.ts';
import { themeTokens } from '../core/tokens.ts';

/**
 * Attributes that put the app's own overlays (the wish composer, the name prompt) in the page's
 * template (owner remark 112): spread them on a dialog or sheet's content element. It then gets
 * the template's tokens, fonts and the app-token bridge (`styles.css`): the accent for the primary
 * button with its auto-contrasted text, the template's corners on buttons and fields, its surface
 * colour and its focus colour. `data-template-surface` undoes the page-only root rules (height,
 * safe-area padding).
 */
export function templateSurfaceProps(
  templateId: string,
  templateVersion: number,
  stored: unknown,
  fontClassName: (heading: FontId, body: FontId) => string,
) {
  const { def, settings } = resolveTheme(templateId, templateVersion, stored);
  const className = fontClassName(settings.headingFont, def.bodyFont);
  return {
    'data-template': def.id,
    'data-scheme': def.scheme,
    'data-template-surface': '',
    style: { ...themeTokens(def, settings), colorScheme: def.scheme } as CSSProperties,
    ...(className === '' ? {} : { className }),
  };
}

export type TemplateSurfaceProps = ReturnType<typeof templateSurfaceProps>;
