import { z } from 'zod';

const webEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
  /**
   * Set to "true" only behind an edge that overwrites X-Forwarded-* / Forwarded headers.
   * Otherwise they are client-controlled and are dropped before reaching the API.
   */
  TRUST_PROXY_HEADERS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/** Names the invalid variables only; values may contain secrets and are never included. */
/** `host:port` of a private service, as hosting platforms expose it (e.g. Render `hostport`). */
const HOSTPORT = /^[A-Za-z0-9.-]+:\d{1,5}$/;

export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const hostport = source.API_INTERNAL_HOSTPORT;
  const withUrl =
    source.API_INTERNAL_URL === undefined && hostport !== undefined && HOSTPORT.test(hostport)
      ? { ...source, API_INTERNAL_URL: `http://${hostport}` }
      : source;
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
