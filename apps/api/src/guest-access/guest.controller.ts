import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  resolveGuestLinkRequestSchema,
  resolveGuestLinkResponseSchema,
  type ResolveGuestLinkRequest,
  type ResolveGuestLinkResponse,
} from '@stepler/contracts';
import { Public } from '../auth/public.decorator.js';
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
}
