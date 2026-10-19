import { Prisma } from '../generated/prisma/client.js';

/**
 * Prisma codes for a database that is busy or briefly unreachable, not for a bad query:
 * P2024 no pool connection in time, P2028 a transaction could not start in time (the load test of
 * 2026-10-19: 150 guests on one link exhausted the staging pool), P1001/P1002 server unreachable
 * or timed out, P1017 the server closed the connection.
 */
const BUSY_CODES = new Set(['P2024', 'P2028', 'P1001', 'P1002', 'P1017']);

/** pg's own message when no pool connection frees up within `connectionTimeoutMillis`. */
const POOL_TIMEOUT = /timeout exceeded when trying to connect/i;

/** True when the error means «try again shortly», so the API answers a retryable 503. */
export function isDatabaseBusy(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return BUSY_CODES.has(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return error instanceof Error && POOL_TIMEOUT.test(error.message);
}
