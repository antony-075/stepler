/**
 * The admin's multi-select on the «Вміст» grid [C7] (DESIGN-SYSTEM.md §5.13), as pure functions
 * over frame ids so the rules are tested apart from the grid.
 */

/** The set with `id` added, or removed if it was there. */
export function toggle(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Shift+click (or Shift+Space): the frames from the last one toggled (`anchor`) to `target`,
 * both included, in grid order, whichever way. Without an anchor still in the list, `target`
 * alone.
 */
export function rangeSelect(
  ids: readonly string[],
  anchor: string | null,
  target: string,
): string[] {
  const to = ids.indexOf(target);
  if (to === -1) return [];
  const from = anchor === null ? -1 : ids.indexOf(anchor);
  if (from === -1) return [target];
  const [start, end] = from <= to ? [from, to] : [to, from];
  return ids.slice(start, end + 1);
}

/** The bulk endpoint takes at most 100 ids per request. */
export const BULK_DELETE_MAX = 100;

/** Ids in requests of at most `size`. */
export function chunks<T>(items: readonly T[], size = BULK_DELETE_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
