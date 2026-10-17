import type { Access } from '@stepler/contracts';
import type { AccessResult } from './domain/access.js';

/** The public shape of a resolved access: state, reason and when it ends. */
export function toAccessDto(access: AccessResult): Access {
  return {
    state: access.state,
    reason: access.reason,
    endsAt: access.endsAt?.toISOString() ?? null,
  };
}
