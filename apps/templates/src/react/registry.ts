import { classic } from '../templates/classic/index.ts';
import { fullscreen } from '../templates/fullscreen/index.ts';
import { journal } from '../templates/journal/index.ts';
import type { GuestTemplate } from './model.ts';

/** Every template's React side, by id; the same ids as `TEMPLATE_DEFINITIONS` (a test checks). */
export const TEMPLATES: Record<string, GuestTemplate> = {
  [classic.id]: classic,
  [fullscreen.id]: fullscreen,
  [journal.id]: journal,
};
