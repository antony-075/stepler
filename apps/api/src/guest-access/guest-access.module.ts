import { Module } from '@nestjs/common';
import { GuestController } from './guest.controller.js';
import { GuestLinkResolver } from './guest-link-resolver.js';
import { GuestLinkTokens } from './guest-link-tokens.js';
import { GuestLinksController } from './guest-links.controller.js';
import { GuestLinksService } from './guest-links.service.js';

/** Guest links (spec §5): the owner-scoped admin side and the public resolver. */
@Module({
  controllers: [GuestLinksController, GuestController],
  providers: [GuestLinkTokens, GuestLinksService, GuestLinkResolver],
  exports: [GuestLinkTokens, GuestLinksService, GuestLinkResolver],
})
export class GuestAccessModule {}
