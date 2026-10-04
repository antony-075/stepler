import { classic } from '../templates/classic/index.js';
import type { GuestTemplate } from './model.js';

/** Every template's React side, by id; the same ids as `TEMPLATE_DEFINITIONS` (a test checks). */
export const TEMPLATES: Record<string, GuestTemplate> = {
  [classic.id]: classic,
};
