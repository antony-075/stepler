import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type GuestLinkThemeResponse,
  guestLinkThemeResponseSchema,
  resolveGuestLinkRequestSchema,
  resolveGuestLinkResponseSchema,
  type ResolveGuestLinkRequest,
  type ResolveGuestLinkResponse,
} from '@stepler/contracts';
import { Public, SkipOriginCheck } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { permissionsOf } from './guest-link-dto.js';
import { GuestLinkResolver } from './guest-link-resolver.js';

/**
 * Public guest endpoints. No session; the CSRF origin check still applies. The guest page
 * resolves its link first (the right state [G6], and the collection id), then exchanges the
 * token for a session under the collection's path (`GuestSessionsController`) [C3].
 */
@ApiTags('Guest')
@Public()
@UseGuards(RateLimitGuard)
@Controller({ path: 'guest', version: '1' })
export class GuestController {
  constructor(private readonly resolver: GuestLinkResolver) {}

  /** A `POST` with the token in the body, so it stays out of URLs and access logs. */
  @Post('links/resolve')
  @HttpCode(HttpStatus.OK)
  @RateLimit('guest-link-resolve')
  @ApiResponse({ status: 200, standardSchema: resolveGuestLinkResponseSchema })
  @ApiResponse({ status: 403, description: 'COLLECTION_ARCHIVED, or LINK_INACTIVE (paused)' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: unknown or malformed token' })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  async resolve(
    @Body({ schema: resolveGuestLinkRequestSchema }) body: ResolveGuestLinkRequest,
  ): Promise<ResolveGuestLinkResponse> {
    const { link, collection } = await this.resolver.resolveActive(body.linkToken);
    return {
      collectionId: collection.id,
      collection: { title: collection.title, description: collection.description },
      permissions: permissionsOf(link),
    };
  }

  /**
   * The look of the link's published page, in any link state (owner remarks 99, 100): the web
   * server asks for it while rendering `/g/{token}`, so the first paint is already the template.
   * Counted like resolution, per route. Read-only and cookie-free, so no Origin check: the
   * caller is that server, which sends none.
   */
  @Post('links/theme')
  @SkipOriginCheck()
  @HttpCode(HttpStatus.OK)
  @RateLimit('guest-link-resolve')
  @ApiResponse({ status: 200, standardSchema: guestLinkThemeResponseSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: unknown token, or the collection is gone' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  async theme(
    @Body({ schema: resolveGuestLinkRequestSchema }) body: ResolveGuestLinkRequest,
  ): Promise<GuestLinkThemeResponse> {
    return this.resolver.themeOf(body.linkToken);
  }
}
