import { getWebEnv } from './env';

/** Exit on invalid configuration instead of serving 500s. */
export function validateEnvOrExit(): void {
  try {
    getWebEnv();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid environment'}\n`);
    process.exit(1);
  }
}
