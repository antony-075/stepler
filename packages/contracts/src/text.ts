// PostgreSQL text cannot store NUL, and other control characters have no place in plain text:
// C0, DEL and C1 (U+007F–U+009F), the Unicode line and paragraph separators (U+2028, U+2029),
// and the bidirectional controls (U+202A–U+202E, U+2066–U+2069), which can make text display
// in another order than it is stored (a file name or title that reads as something else).
// Matching control characters is the point of these patterns, hence the lint exceptions.
// A module of its own so collections and guest links can both use them without an import cycle.
export const NO_CONTROL_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /^[^\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]*$/;
/** The same, but line feeds, carriage returns and tabs are kept (multi-line plain text). */
export const NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS =
  // eslint-disable-next-line no-control-regex
  /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]*$/;

/**
 * Length in Unicode code points, as PostgreSQL's `char_length` counts it: an emoji is one, while
 * `String.length` counts its two UTF-16 units.
 */
export const codePointLength = (value: string): number => [...value].length;
