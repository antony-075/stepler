import { Prisma } from '../generated/prisma/client.js';

export interface ConstraintViolation {
  kind: 'unique' | 'check';
  /** The constraint or index name, e.g. `User_email_key` or `User_blocked_consistent`. */
  constraint: string;
}

const CHECK_VIOLATION = '23514';

interface DriverAdapterCause {
  originalCode?: unknown;
  originalMessage?: unknown;
  constraint?: { index?: unknown };
}

function driverCause(error: Prisma.PrismaClientKnownRequestError): DriverAdapterCause | undefined {
  const meta = error.meta as { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

/**
 * Identifies a database constraint violation by name so services can map it to an error code.
 * Never log or return `error.meta`: it contains the failing row (ADR 0005, spike S6).
 */
export function constraintViolation(error: unknown): ConstraintViolation | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = driverCause(error);
  if (error.code === 'P2002') {
    const index = cause?.constraint?.index;
    return typeof index === 'string' ? { kind: 'unique', constraint: index } : null;
  }
  // The adapter exposes no constraint field for CHECK violations, so the name comes from the
  // server message; this assumes English `lc_messages` (the PostgreSQL image default).
  if (cause?.originalCode === CHECK_VIOLATION && typeof cause.originalMessage === 'string') {
    const name = /violates check constraint "([^"]+)"/.exec(cause.originalMessage)?.[1];
    return name === undefined ? null : { kind: 'check', constraint: name };
  }
  return null;
}
