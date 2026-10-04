import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  magicLinkPreviewResponseSchema,
  magicLinkRequestResponseSchema,
  magicLinkRequestSchema,
  magicLinkVerifyRequestSchema,
  magicLinkVerifyResponseSchema,
  type MagicLinkPreviewResponse,
  type MagicLinkRequest,
  type MagicLinkRequestResponse,
  type MagicLinkVerifyRequest,
  type MagicLinkVerifyResponse,
} from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { MagicLinkService } from './magic-link.service.js';
import { Public } from './public.decorator.js';
import { RateLimit, RateLimitGuard } from './rate-limit.js';
import { SessionService } from './session.service.js';
import { readCookie, SESSION_COOKIE, setSessionCookie } from './session-cookie.js';

type RequestWithIp = IncomingMessage & { ip?: string };

@Public()
@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller({ path: 'auth/magic-link', version: '1' })
export class MagicLinkController {
  constructor(
    private readonly magicLinks: MagicLinkService,
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Emails a sign-in link. Always 202 with the same body after a valid Turnstile token and the
   * current legal versions (the sign-in card's required checkbox, ADR 0016).
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({ status: 202, standardSchema: magicLinkRequestResponseSchema })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED (also without `legal`), TURNSTILE_FAILED, or LEGAL_VERSION_OUTDATED (refetch GET /auth/methods)',
  })
  async request(
    @Body({ schema: magicLinkRequestSchema }) body: MagicLinkRequest,
    @Req() req: RequestWithIp,
  ): Promise<MagicLinkRequestResponse> {
    await this.magicLinks.request(body, req.ip);
    return { status: 'sent' };
  }

  /** The email a link signs in to. Does not consume the link. */
  @Post('preview')
  @RateLimit('magic-link-preview')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: magicLinkPreviewResponseSchema })
  preview(
    @Body({ schema: magicLinkVerifyRequestSchema }) body: MagicLinkVerifyRequest,
  ): Promise<MagicLinkPreviewResponse> {
    return this.magicLinks.preview(body.token);
  }

  /** Consumes the link and sets the session cookie, replacing any current session. */
  @Post('verify')
  @RateLimit('magic-link-preview')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: magicLinkVerifyResponseSchema })
  async verify(
    @Body({ schema: magicLinkVerifyRequestSchema }) body: MagicLinkVerifyRequest,
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
    @RequestId() requestId: string | undefined,
  ): Promise<MagicLinkVerifyResponse> {
    const userId = await this.magicLinks.verify(body.token, requestId);
    const previous = readCookie(req, SESSION_COOKIE);
    if (previous !== undefined) await this.sessions.revoke(previous);
    const session = await this.sessions.create(userId);
    setSessionCookie(res, session.token, session.expiresAt, this.env);
    return { status: 'signed-in' };
  }
}
