import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL } from './env.js';

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** Runs the Prisma CLI against the e2e database. The URL goes through env, never argv. */
function prisma(args: string[], input?: string): void {
  try {
    execFileSync('pnpm', ['exec', 'prisma', ...args], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'],
    });
  } catch {
    // The child's error message would repeat its environment-dependent output; keep it generic.
    throw new Error(`e2e setup failed: prisma ${args.join(' ')} (is docker compose up?)`);
  }
}

/** Migrates the e2e database and empties it, so every run starts clean. */
export default function globalSetup(): void {
  prisma(['migrate', 'deploy']);
  prisma(
    ['db', 'execute', '--stdin'],
    'TRUNCATE "User", "AuthAccount", "AuthSession", "MagicLinkToken" RESTART IDENTITY CASCADE;',
  );
}
