import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Local compose credentials: `docker/.env` if present, else the committed example (CI). */
function composeEnv(): Record<string, string | undefined> {
  for (const file of ['../../docker/.env', '../../docker/.env.example']) {
    try {
      return parseEnv(readFileSync(new URL(file, import.meta.url), 'utf8'));
    } catch {
      // Try the next file.
    }
  }
  return {};
}

export const compose = composeEnv();
const pgAuth = `${compose.POSTGRES_USER ?? 'stepler'}:${compose.POSTGRES_PASSWORD ?? ''}`;
const pgHost = `127.0.0.1:${compose.POSTGRES_PORT ?? '5433'}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? `postgresql://${pgAuth}@${pgHost}/stepler_e2e`;
