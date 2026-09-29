import type { NextRequest } from 'next/server';
import {
  downstreamResponseHeaders,
  upstreamRequestHeaders,
  upstreamUrl,
} from '@/api-proxy/forward';
import { getWebEnv } from '@/env';

/**
 * Same-origin API: streams /api/* to the NestJS API. The target is read at runtime, so one
 * image works in every environment (build-time rewrites would bake the URL in).
 */
async function forward(request: NextRequest): Promise<Response> {
  const env = getWebEnv();
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(
      upstreamUrl(request.nextUrl.pathname, request.nextUrl.search, env.API_INTERNAL_URL),
      {
        method: request.method,
        headers: upstreamRequestHeaders(request.headers, {
          trustForwardedHeaders: env.TRUST_PROXY_HEADERS,
        }),
        body: hasBody ? request.body : undefined,
        // Stream request bodies instead of buffering them.
        duplex: 'half',
        redirect: 'manual',
        cache: 'no-store',
      } as RequestInit & { duplex: 'half' },
    );
  } catch {
    return Response.json(
      {
        type: 'about:blank',
        title: 'Bad Gateway',
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
      },
      { status: 502, headers: { 'content-type': 'application/problem+json' } },
    );
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: downstreamResponseHeaders(upstream.headers),
  });
}

export const dynamic = 'force-dynamic';
export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as HEAD,
  forward as OPTIONS,
};
