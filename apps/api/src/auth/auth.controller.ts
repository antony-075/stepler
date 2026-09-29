import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { clearSessionCookie, readCookie, SESSION_COOKIE } from './session-cookie.js';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

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
