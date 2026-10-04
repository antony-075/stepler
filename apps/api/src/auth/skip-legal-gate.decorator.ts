import { SetMetadata } from '@nestjs/common';

export const SKIP_LEGAL_GATE = 'stepler:skipLegalGate';

/**
 * Lets a signed-in user who has not accepted the legal documents through `AuthGuard`'s gate
 * (ADR 0016). Only `GET /me`, `PATCH /me` (the fallback page's language switch) and
 * `POST /me/legal-acceptances`; every other account route answers `403
 * LEGAL_ACCEPTANCE_REQUIRED` until both documents are accepted.
 */
export const SkipLegalGate = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_LEGAL_GATE, true);
