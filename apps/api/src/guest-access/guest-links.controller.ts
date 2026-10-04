import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  collectionIdParamsSchema,
  createGuestLinkRequestSchema,
  guestLinkIdParamsSchema,
  guestLinkListResponseSchema,
  guestLinkSchema,
  rotateDefaultLinkRequestSchema,
  updateGuestLinkRequestSchema,
  type CreateGuestLinkRequest,
  type GuestLink,
  type GuestLinkListResponse,
  type RotateDefaultLinkRequest,
  type UpdateGuestLinkRequest,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { GuestLinksService } from './guest-links.service.js';

interface IdParams {
  id: string;
}

const NOT_FOUND = { status: 404, description: 'NOT_FOUND: not a link of one of your collections' };
const REVOKED = { status: 409, description: 'LINK_REVOKED: the link is revoked' };

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
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
  ): Promise<GuestLinkListResponse> {
    return this.links.list(principal, params.id);
  }

  @Post('collections/:id/guest-links')
  @ApiResponse({ status: 201, standardSchema: guestLinkSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not one of your collections' })
  @ApiResponse({
    status: 409,
    description: 'GUEST_LINK_LIMIT_REACHED: the collection has its maximum of additional links',
  })
  create(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
    @Body({ schema: createGuestLinkRequestSchema }) body: CreateGuestLinkRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.create(principal, params.id, body, requestId);
  }

  @Post('collections/:id/guest-links/default/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    standardSchema: guestLinkSchema,
    description: 'The new default link, or the current one if it is no longer expectedLinkId',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not one of your collections' })
  rotateDefault(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
    @Body({ schema: rotateDefaultLinkRequestSchema }) body: RotateDefaultLinkRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.rotateDefault(principal, params.id, body, requestId);
  }

  @Patch('guest-links/:id')
  @ApiResponse({ status: 200, standardSchema: guestLinkSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: invalid permissions, or a label on the default link',
  })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(REVOKED)
  update(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestLinkIdParamsSchema }) params: IdParams,
    @Body({ schema: updateGuestLinkRequestSchema }) body: UpdateGuestLinkRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.update(principal, params.id, body, requestId);
  }

  @Post('guest-links/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestLinkSchema, description: 'Paused' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(REVOKED)
  deactivate(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestLinkIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.deactivate(principal, params.id, requestId);
  }

  @Post('guest-links/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestLinkSchema, description: 'Resumed' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(REVOKED)
  activate(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestLinkIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.activate(principal, params.id, requestId);
  }

  @Post('guest-links/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    standardSchema: guestLinkSchema,
    description: 'Revoked; url is null',
  })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description: 'DEFAULT_LINK_NOT_REVOCABLE: the default link is rotated, not revoked',
  })
  revoke(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestLinkIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<GuestLink> {
    return this.links.revoke(principal, params.id, requestId);
  }

  @Delete('guest-links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description:
      'Deleted: revoked if it was live, and no longer listed. The record stays for the audit trail. Deleting again is a no-op.',
  })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description: 'DEFAULT_LINK_NOT_REVOCABLE: the default link is rotated, not deleted',
  })
  remove(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestLinkIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.links.remove(principal, params.id, requestId);
  }
}
