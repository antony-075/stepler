/**
 * The least size of a touch target in a story test (DESIGN-SYSTEM.md §0.4, §9): 44px on phones
 * and touch screens, 32px with a mouse from `md` (V1 density; above WCAG 2.5.8's 24px).
 */
export function minTarget(): number {
  return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches ? 32 : 44;
}
