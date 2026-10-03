/** `#` and at least three digits (`#001`); four from 1000 (DESIGN-SYSTEM.md §3.4). */
export function formatFrameNumber(value: number): string {
  return `#${String(value).padStart(3, '0')}`;
}
