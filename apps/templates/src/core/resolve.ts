import type { ThemeSettings } from '@stepler/contracts';
import { settingsSchemaFor, type TemplateDefinition } from './definition.js';
import { DEFAULT_TEMPLATE_ID, TEMPLATE_DEFINITIONS } from './registry.js';

export type ResolvedTheme = {
  def: TemplateDefinition;
  settings: ThemeSettings;
  /** True when the stored template or settings could not be used and defaults were. */
  fellBack: boolean;
};

/**
 * A stored page's template and settings, ready to render. Never throws: an unknown template
 * (removed since) gives the default template's defaults; settings stored under an older
 * version are migrated first; settings that still do not validate give the template's
 * defaults. `definitions` is for tests.
 */
export function resolveTheme(
  templateId: string,
  templateVersion: number,
  settings: unknown,
  definitions: readonly TemplateDefinition[] = TEMPLATE_DEFINITIONS,
): ResolvedTheme {
  const def = definitions.find((candidate) => candidate.id === templateId);
  if (def === undefined) {
    const fallback =
      definitions.find((candidate) => candidate.id === DEFAULT_TEMPLATE_ID) ?? definitions[0];
    if (fallback === undefined) throw new Error('No template is registered');
    return { def: fallback, settings: fallback.defaults, fellBack: true };
  }
  let candidate = settings;
  if (templateVersion < def.version) {
    try {
      candidate = def.migrate(templateVersion, settings);
    } catch {
      return { def, settings: def.defaults, fellBack: true };
    }
  }
  const parsed = settingsSchemaFor(def).safeParse(candidate);
  return parsed.success
    ? { def, settings: parsed.data, fellBack: false }
    : { def, settings: def.defaults, fellBack: true };
}
