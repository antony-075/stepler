import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL } from './env.js';

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** Runs one SQL script against the e2e database through the Prisma CLI (URL via env, never argv). */
function execute(sql: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    input: sql,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

/**
 * Turns an account into one from before the sign-in checkbox (ADR 0016): no acceptance rows. The
 * UI cannot produce such an account any more; the fallback page exists for them.
 */
export function dropLegalAcceptances(email: string): void {
  if (!/^[a-z0-9@.-]+$/.test(email)) throw new Error('unexpected e-mail format');
  execute(
    `DELETE FROM "LegalAcceptance" WHERE "userId" IN (SELECT id FROM "User" WHERE email = '${email}');`,
  );
}
