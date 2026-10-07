import type { ErrorCode } from '@stepler/contracts';

/** Catalog key for an API error code; every code has one in `messages/{uk,en}.json`. */
export function errorMessageKey(code: ErrorCode): `errors.${ErrorCode}` {
  return `errors.${code}`;
}

/**
 * The message for a failed sign-in: a blocked account (slice 9, R7) also gets the address to
 * write to when `LEGAL_CONTACT_EMAIL` is set; every other code its catalog message.
 */
export function signInErrorMessage(
  t: (key: string, values?: Record<string, string>) => string,
  code: ErrorCode,
  contactEmail: string | null,
): string {
  if (code === 'ACCOUNT_BLOCKED' && contactEmail !== null) {
    return t('login.accountBlockedContact', { email: contactEmail });
  }
  return t(errorMessageKey(code));
}
