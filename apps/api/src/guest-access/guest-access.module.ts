import { Module } from '@nestjs/common';
import { GuestLinkTokens } from './guest-link-tokens.js';
import { GuestLinksController } from './guest-links.controller.js';
import { GuestLinksService } from './guest-links.service.js';

/** Guest links (spec §5): the admin side here, the public resolver alongside. */
@Module({
  controllers: [GuestLinksController],
  providers: [GuestLinkTokens, GuestLinksService],
  exports: [GuestLinkTokens, GuestLinksService],
})
export class GuestAccessModule {}
