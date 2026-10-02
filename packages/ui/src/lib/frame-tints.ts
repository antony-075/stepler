/**
 * The curated tints of empty frames (DESIGN-SYSTEM.md §2.1 «Відтінки кадрів»): calm, muted
 * fills from the palette, each with an edge and an ink that passes 4.5:1 on it. A plain module,
 * so apps can pick a tint without importing a component.
 */
export const FRAME_TINTS = ['sage', 'lavender', 'sand', 'sky'] as const;

export type FrameTint = (typeof FRAME_TINTS)[number];

/** Fill, edge and ink of each tint, as literal class names so Tailwind finds them. */
export const FRAME_TINT_CLASSES: Record<FrameTint, string> = {
  sage: 'border-tint-sage-edge bg-tint-sage text-tint-sage-ink',
  lavender: 'border-tint-lavender-edge bg-tint-lavender text-tint-lavender-ink',
  sand: 'border-tint-sand-edge bg-tint-sand text-tint-sand-ink',
  sky: 'border-tint-sky-edge bg-tint-sky text-tint-sky-ink',
};
