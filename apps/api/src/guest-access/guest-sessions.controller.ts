import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  guestCollectionParamsSchema,
  guestContextSchema,
  guestSessionRequestSchema,
  updateGuestSessionRequestSchema,
  type GuestContext,
  type GuestSessionRequest,
  type UpdateGuestSessionRequest,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { readCookie } from '../auth/session-cookie.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { GUEST_SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentGuest } from './current-guest.decorator.js';
import { GUEST_SESSION_COOKIE, setGuestSessionCookie } from './guest-session-cookie.js';
import { GuestSessionGuard } from './guest-session.guard.js';
import { GuestSessionsService } from './guest-sessions.service.js';

interface GuestCollectionParams {
  collectionId: string;
}

const STATE_ERRORS = [
  { status: 403, description: 'COLLECTION_ARCHIVED, or LINK_INACTIVE (paused)' },
  { status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' },
] as const;

/**
 * The guest session of one collection [C3]. Every route lives under the `st_gs` cookie's path,
 * so the browser sends the cookie here and nowhere else. No admin session; the CSRF origin
 * check still applies to unsafe methods.
 */
@ApiTags('Guest')
@Public()
@Controller({ path: 'guest/collections/:collectionId', version: '1' })
export class GuestSessionsController {
  constructor(
    private readonly sessions: GuestSessionsService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Exchanges the link token for the session cookie, or re-binds the session the cookie names
   * to this link. Always renews the cookie's lifetime.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('guest-session-create')
  @ApiResponse({ status: 200, standardSchema: guestContextSchema })
  @ApiResponse({
    status: 404,
    description: "NOT_FOUND: unknown token, or a link of another collection than the path's",
  })
  @ApiResponse(STATE_ERRORS[0])
  @ApiResponse(STATE_ERRORS[1])
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  async exchange(
    @Param({ schema: guestCollectionParamsSchema }) params: GuestCollectionParams,
    @Body({ schema: guestSessionRequestSchema }) body: GuestSessionRequest,
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<GuestContext> {
    const cookieToken = readCookie(req, GUEST_SESSION_COOKIE);
    const { context, newToken } = await this.sessions.exchange(
      params.collectionId,
      body.linkToken,
      cookieToken,
    );
    const token = newToken ?? cookieToken;
    if (token !== undefined) setGuestSessionCookie(res, token, params.collectionId, this.env);
    return context;
  }

  /** The guest's optional name [O4]; `null` skips or clears it. */
  @Patch('session')
  @UseGuards(RateLimitGuard, GuestSessionGuard)
  @RateLimit('guest-write')
  @ApiCookieAuth(GUEST_SESSION_COOKIE_SCHEME)
  @ApiResponse({ status: 200, standardSchema: guestContextSchema })
  @ApiResponse({
    status: 401,
    description: 'GUEST_SESSION_REQUIRED: no session for this collection',
  })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN (a view-only link), COLLECTION_ARCHIVED or LINK_INACTIVE',
  })
  @ApiResponse(STATE_ERRORS[1])
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  updateName(
    @CurrentGuest() guest: GuestPrincipal,
    @Body({ schema: updateGuestSessionRequestSchema }) body: UpdateGuestSessionRequest,
  ): Promise<GuestContext> {
    return this.sessions.updateName(guest, body.name);
  }

  @Get('context')
  @UseGuards(RateLimitGuard, GuestSessionGuard)
  @RateLimit('guest-read')
  @ApiCookieAuth(GUEST_SESSION_COOKIE_SCHEME)
  @ApiResponse({ status: 200, standardSchema: guestContextSchema })
  @ApiResponse({
    status: 401,
    description: 'GUEST_SESSION_REQUIRED: no session for this collection',
  })
  @ApiResponse(STATE_ERRORS[0])
  @ApiResponse(STATE_ERRORS[1])
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  context(@CurrentGuest() guest: GuestPrincipal): Promise<GuestContext> {
    return this.sessions.context(guest);
  }
}
