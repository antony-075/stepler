/** Liveness of the web server itself; does not call the API (platform health checks use it). */
export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
