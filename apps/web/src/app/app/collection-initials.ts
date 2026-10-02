/**
 * A collection's initials for its identity tile (DESIGN-SYSTEM.md §5.10): the first letter of
 * its first two words, or of its only word («Ювілей бабусі» → «ЮБ», «Випускний 2025» → «В»).
 * Digits count only when the title has no letter at all («2025» → «2»); a title with neither
 * (an emoji, punctuation) shows its first character.
 */
export function collectionInitials(title: string): string {
  const words = title.normalize('NFC').trim().split(/\s+/u);
  const firstOf = (pattern: RegExp) =>
    words.flatMap((word) => {
      const match = pattern.exec(word);
      return match === null ? [] : [match[0]];
    });
  const letters = firstOf(/\p{L}/u);
  const picked = letters.length > 0 ? letters : firstOf(/\p{N}/u).slice(0, 1);
  if (picked.length > 0) return picked.slice(0, 2).join('').toLocaleUpperCase();
  return Array.from(title.trim())[0] ?? '';
}
