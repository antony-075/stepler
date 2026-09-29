import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './env.js';

/** Applies migrations to the test database once per integration run. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
