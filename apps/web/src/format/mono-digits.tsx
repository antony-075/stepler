import type { ReactNode } from 'react';

/**
 * Digits (with their group and decimal separators) in Geist Mono, the words in Golos Text, which
 * carries the Cyrillic (DESIGN-SYSTEM.md §0.2): «3,2 ГБ з 20 ГБ». `className` styles the digits.
 */
export function monoDigits(text: string, className = 'font-mono tabular-nums'): ReactNode[] {
  return text.split(/(\d[\d\s.,]*\d|\d)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className={className}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
