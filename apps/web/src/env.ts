import { z } from 'zod';

/** Headers that can never carry a trustworthy client IP (the client can set their first value). */
const UNTRUSTED_IP_HEADERS = new Set(['x-forwarded-for', 'forwarded', 'x-real-ip']);

const webEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
  /**
   * The request header in which the edge sets the client IP and overwrites any client-sent
   * value, e.g. `cf-connecting-ip` behind Cloudflare/Render. Unset: no client IP is forwarded
   * and the API sees this server's address.
   */
  CLIENT_IP_HEADER: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9-]+$/))
    .refine((value) => !UNTRUSTED_IP_HEADERS.has(value))
    .optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/** `host:port` of a private service, as hosting platforms expose it (e.g. Render `hostport`). */
const HOSTPORT = /^[A-Za-z0-9.-]+:\d{1,5}$/;

/** Names the invalid variables only; values may contain secrets and are never included. */
export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const hostport = source.API_INTERNAL_HOSTPORT;
  const withUrl =
    source.API_INTERNAL_URL === undefined && hostport !== undefined && HOSTPORT.test(hostport)
      ? { ...source, API_INTERNAL_URL: `http://${hostport}` }
      : source;
  // TRUST_PROXY_HEADERS (replaced by CLIENT_IP_HEADER) is ignored, not rejected: platforms keep
  // variables removed from their config, and failing on it would take the site down.
  const result = webEnvSchema.safeParse(withUrl);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

let cached: WebEnv | undefined;

/** Validated server env, parsed once per process. */
export function getWebEnv(): WebEnv {
  cached ??= loadWebEnv(process.env);
  return cached;
}
