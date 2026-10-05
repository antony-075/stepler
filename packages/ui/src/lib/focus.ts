/**
 * Focus (DESIGN-SYSTEM.md §2.5, §9; owner remark 103, 2026-10-05): one clean indicator, never a
 * doubled one. The colour is `--ring`, the violet link colour in each theme, never the pencil:
 * red-orange around a field reads as an error (owner decision 2026-10-02). The solid violet is
 * what meets WCAG 2.4.11/2.4.13 (≥ 3:1 against the sheet and the page in both themes); the soft
 * halo is extra.
 *
 * - `focusRing`: elements without a border of their own (filled and ghost buttons, links, tiles
 *   drawn without an edge): a 2px outline 2px outside, on `:focus-visible`.
 * - `focusHalo`: elements with a border (outline buttons, chips, cards, checkboxes): the border
 *   itself turns violet and a 3px halo of violet at 25% surrounds it, on `:focus-visible`. No gap,
 *   no second line.
 * - `fieldFocus`: text fields and select triggers: the same as `focusHalo`, on any focus (a click
 *   into a field shows where typing goes).
 */
export const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

/** The same ring drawn inside the element, for rows inside a scroll box (menu and select items). */
export const focusRingInset =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring';

/** Bordered controls: a violet border and a soft halo, keyboard focus only. */
export const focusHalo =
  'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25';

/** Text fields and select triggers: a violet border and a soft halo on any focus. */
export const fieldFocus = 'outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/25';
