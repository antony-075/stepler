/** Query keys whose values are credentials: magic-link/OAuth tokens and S3 signatures. */
const SECRET_QUERY_KEY = /^(token|code|state|x-amz-.*)$/i;

export const REDACTED = '[REDACTED]';

/**
 * Replaces secret query values in a request URL for logging. Works on the raw string so the
 * rest of the URL is logged exactly as received.
 */
export function redactUrl(url: string): string {
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
