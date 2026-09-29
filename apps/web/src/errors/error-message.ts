import type { ErrorCode } from '@stepler/contracts';

/** Catalog key for an API error code; every code has one in `messages/{uk,en}.json`. */
export function errorMessageKey(code: ErrorCode): `errors.${ErrorCode}` {
  return `errors.${code}`;
}
