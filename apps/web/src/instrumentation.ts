/** Runs once at server start. Node-only code is loaded lazily so the edge bundle stays clean. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvOrExit } = await import('./instrumentation-node');
    validateEnvOrExit();
  }
}
