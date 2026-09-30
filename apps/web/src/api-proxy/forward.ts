import { isIP } from 'node:net';

/**
 * Headers that describe one connection, not the message (RFC 9110 §7.6.1), plus `expect`
 * (100-continue is negotiated per connection; undici refuses to forward it).
 */
const HOP_BY_HOP = new Set([
  'connection',
  'expect',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Client-controlled claims about the original request; spoofable unless a trusted edge overwrites them. */
const FORWARDING = new Set([
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
]);

export function upstreamUrl(pathname: string, search: string, base: string): URL {
  if (!pathname.startsWith('/api/')) throw new Error('Only /api/* is proxied');
  const origin = new URL(base).origin;
  // Concatenate onto the origin instead of resolving, so "//host" paths cannot change the target.
  const url = new URL(`${origin}${pathname}${search}`);
  if (url.origin !== origin) throw new Error('Proxy target left the configured origin');
  return url;
}

/**
 * The client IP a trusted edge put first in X-Forwarded-For (Render/Cloudflare do this), or
 * `undefined` when it is not a plain IP address.
 */
function trustedClientIp(incoming: Headers): string | undefined {
  const first = incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return isIP(first) === 0 ? undefined : first;
}

/**
 * Request headers for the API. Client-supplied forwarding headers never pass. Behind a trusted
 * edge, the API gets exactly one `X-Forwarded-For: <client IP>`, and trusts this web server as
 * its only proxy (`API_TRUST_PROXY=1`), so per-IP limits see the real client.
 */
export function upstreamRequestHeaders(
  incoming: Headers,
  options: { trustForwardedHeaders: boolean },
): Headers {
  const headers = new Headers();
  incoming.forEach((value, name) => {
    if (name === 'host' || HOP_BY_HOP.has(name) || FORWARDING.has(name)) return;
    headers.append(name, value);
  });
  if (options.trustForwardedHeaders) {
    const clientIp = trustedClientIp(incoming);
    if (clientIp !== undefined) headers.set('x-forwarded-for', clientIp);
  }
  return headers;
}

export function downstreamResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  upstream.forEach((value, name) => {
    // fetch() already decoded the body, so the original encoding/length no longer apply.
    if (HOP_BY_HOP.has(name) || name === 'content-encoding' || name === 'content-length') return;
    if (name === 'set-cookie') return;
    headers.append(name, value);
  });
  for (const cookie of upstream.getSetCookie()) headers.append('set-cookie', cookie);
  return headers;
}
