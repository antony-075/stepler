/**
 * The focus ring of every interactive element (DESIGN-SYSTEM.md §2.5, §9): a 2px solid
 * `--ring` outline 2px outside the element. `--ring` is the violet link colour, never the
 * pencil: red-orange around a field reads as an error (owner decision 2026-10-02).
 * Always paired with `outline-none` for the unfocused state, never replaced by nothing.
 */
export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

/** The same ring drawn inside the element, for rows inside a scroll box (menu and select items). */
export const focusRingInset =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring';
