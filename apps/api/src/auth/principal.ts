import type { IncomingMessage } from 'node:http';
import type { GuestLinkPermissions } from '@stepler/contracts';

export type AdminPrincipal = { kind: 'admin'; userId: string };
export type OperatorPrincipal = { kind: 'operator'; userId: string };

/** A signed-in account. Admin services take only this, so a guest cannot reach them by type. */
export type AccountPrincipal = AdminPrincipal | OperatorPrincipal;

/**
 * A guest session in one collection, through the link it is bound to now (ADR 0007). Set by
 * `GuestSessionGuard` on guest collection routes only.
 */
export interface GuestPrincipal {
  kind: 'guest';
  guestSessionId: string;
  collectionId: string;
  link: { id: string; permissions: GuestLinkPermissions };
}

/** Who is making the request. */
export type Principal = AccountPrincipal | GuestPrincipal;

export type RequestWithPrincipal = IncomingMessage & { principal?: Principal };
