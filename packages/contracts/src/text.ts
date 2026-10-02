// PostgreSQL text cannot store NUL, and other C0 control characters have no place in plain text.
// Matching control characters is the point of these patterns, hence the lint exceptions.
// A module of its own so collections and guest links can both use them without an import cycle.
// eslint-disable-next-line no-control-regex
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001f]*$/;
export const NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS =
  // eslint-disable-next-line no-control-regex
  /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/;
