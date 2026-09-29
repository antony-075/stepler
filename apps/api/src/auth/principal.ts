import type { IncomingMessage } from 'node:http';

/** Who is making the request. Guest principals arrive with guest links (Phase 4). */
export type Principal = { kind: 'admin'; userId: string } | { kind: 'operator'; userId: string };

export type RequestWithPrincipal = IncomingMessage & { principal?: Principal };
