import { Module } from '@nestjs/common';
import { GuestController } from './guest.controller.js';
import { GuestLinkResolver } from './guest-link-resolver.js';
import { GuestLinkTokens } from './guest-link-tokens.js';
import { GuestLinksController } from './guest-links.controller.js';
import { GuestLinksService } from './guest-links.service.js';
import { GuestSessionGuard } from './guest-session.guard.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { GuestSessionsService } from './guest-sessions.service.js';

/**
 * Guest links (spec §5): the owner-scoped admin side and the public resolver; guest sessions
 * (ADR 0007): the per-collection cookie, its exchange and the guard of guest collection routes.
 */
@Module({
  controllers: [GuestLinksController, GuestController, GuestSessionsController],
  providers: [
    GuestLinkTokens,
    GuestLinksService,
    GuestLinkResolver,
    GuestSessionsService,
    GuestSessionGuard,
  ],
  exports: [
    GuestLinkTokens,
    GuestLinksService,
    GuestLinkResolver,
    GuestSessionsService,
    GuestSessionGuard,
  ],
})
export class GuestAccessModule {}
