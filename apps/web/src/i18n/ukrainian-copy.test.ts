import { expect, test } from 'vitest';
import uk from '../../messages/uk.json';

/** Every string of a catalog with its dotted key. */
function flattenStrings(obj: object, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flattenStrings(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(value)] as [string, string]],
  );
}

// Ukrainian copy rules (docs/design/DESIGN-SYSTEM.md §3.4). The apostrophe is always ’ (U+2019):
// it is what keyboards type, both fonts have it, and mixing it with ' (U+0027) or ʼ (U+02BC)
// breaks search. A plain ' is also ICU syntax (quoting) and would vanish from the text.
test.each(flattenStrings(uk))('uk %s uses ’ as the apostrophe', (_key, value) => {
  expect(value).not.toMatch(/['ʼ]/);
});

// Ellipsis as one character, also in loading states ("Завантаження…").
test.each(flattenStrings(uk))('uk %s writes … as one character', (_key, value) => {
  expect(value).not.toContain('...');
});
