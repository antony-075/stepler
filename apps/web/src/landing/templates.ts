/** The six guest page templates (apps/templates), in the editor's order. */
export const TEMPLATE_KEYS = [
  'classic',
  'fullscreen',
  'journal',
  'postcard',
  'party',
  'minimal',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
