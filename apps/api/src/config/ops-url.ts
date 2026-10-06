/**
 * A link into the operator console (`/ops`, slice 9). The only place a console URL is built, so a
 * later `ops.<domain>` changes this function alone (plan "Console architecture").
 */
export function opsUrl(env: { APP_ORIGIN: string }, path: `/${string}`): string {
  return `${env.APP_ORIGIN}/ops${path}`;
}
