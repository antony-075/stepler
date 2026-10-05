import { classic } from '../templates/classic/definition.ts';
import { fullscreen } from '../templates/fullscreen/definition.ts';
import { journal } from '../templates/journal/definition.ts';
import { party } from '../templates/party/definition.ts';
import { postcard } from '../templates/postcard/definition.ts';
import type { TemplateDefinition } from './definition.ts';

/** Every template, in the order the editor shows them. Ids match the folders in `src/templates`. */
export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  classic,
  fullscreen,
  journal,
  postcard,
  party,
];

/** What a collection without a stored page, or with an unknown template, gets. */
export const DEFAULT_TEMPLATE_ID = 'classic';

export function definitionOf(id: string): TemplateDefinition | undefined {
  return TEMPLATE_DEFINITIONS.find((def) => def.id === id);
}
