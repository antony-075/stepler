import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  authMethodsResponseSchema,
  type AuthMethodsResponse,
  currentLegalVersions,
} from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { GOOGLE_IDENTITY, type GoogleIdentity } from './google/google-identity.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { clearSessionCookie, readCookie, SESSION_COOKIE } from './session-cookie.js';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentity | null,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Sign-in options for the web app, read at runtime so it needs no provider config itself, and
   * the current legal versions.
   */
  @Public()
  @Get('methods')
  @ApiResponse({ status: 200, standardSchema: authMethodsResponseSchema })
  methods(): AuthMethodsResponse {
    return {
      magicLink: true,
      google: this.google !== null,
      turnstileSiteKey: this.env.TURNSTILE_SITE_KEY,
      // The versions the sign-in card's checkbox accepts and sends back (ADR 0016).
      legal: currentLegalVersions(),
    };
  }

  /** Ends the current session. Idempotent: succeeds without a session too. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Signed out; the session cookie is cleared' })
  async logout(
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token !== undefined) await this.sessions.revoke(token);
    clearSessionCookie(res, this.env);
  }
}
