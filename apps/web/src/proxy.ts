import { type NextRequest, NextResponse } from 'next/server';
import { loadWebEnv } from './env';

/**
 * Same-origin API: forwards /api/* to the NestJS API. The target is read at runtime
 * (next.config rewrites are fixed at build time, which would bake the URL into the image).
 */
export function proxy(request: NextRequest): NextResponse {
  const { API_INTERNAL_URL } = loadWebEnv(process.env);
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, API_INTERNAL_URL);
  return NextResponse.rewrite(target);
}

export const config = { matcher: '/api/:path*' };
