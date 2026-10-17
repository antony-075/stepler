/** Query keys whose values are credentials: mailed account/OAuth/guest-link tokens, S3 signatures. */
const SECRET_QUERY_KEY = /^(token|code|state|linkToken|x-amz-.*)$/i;

/** A guest link page path, `/g/<token>` (optionally under a locale prefix), e.g. in a Referer. */
const GUEST_LINK_PATH = /\/g\/[^/?#]+/g;

export const REDACTED = '[REDACTED]';

/**
 * Replaces secret query values in a request URL for logging. Works on the raw string so the
 * rest of the URL is logged exactly as received.
 */
export function redactUrl(raw: string): string {
  const url = raw.replace(GUEST_LINK_PATH, `/g/${REDACTED}`);
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const query = url
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        // Malformed escapes: match on the raw key.
      }
      return SECRET_QUERY_KEY.test(key) ? `${rawKey}=${REDACTED}` : pair;
    })
    .join('&');
  return `${url.slice(0, queryStart)}?${query}`;
}
