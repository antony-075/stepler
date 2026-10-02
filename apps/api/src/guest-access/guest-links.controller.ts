import { Controller, Get, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  collectionIdParamsSchema,
  guestLinkListResponseSchema,
  type GuestLinkListResponse,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/principal.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { GuestLinksService } from './guest-links.service.js';

interface IdParams {
  id: string;
}

/**
 * Guest links of the signed-in admin's own collections; anything else is 404. Responses carry
 * link URLs (secrets), so they are `Cache-Control: no-store` like every API response.
 */
@ApiTags('Guest links')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ version: '1' })
export class GuestLinksController {
  constructor(private readonly links: GuestLinksService) {}

  @Get('collections/:id/guest-links')
  @ApiResponse({ status: 200, standardSchema: guestLinkListResponseSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not one of your collections' })
  list(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
  ): Promise<GuestLinkListResponse> {
    return this.links.list(principal, params.id);
  }
}
