import { loadWebEnv } from './env';

/** Runs once at server start: fail fast on invalid configuration instead of on the first request. */
export function register(): void {
  loadWebEnv(process.env);
}
