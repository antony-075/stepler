import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, Get, Inject, Logger, Query, Redirect, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { generateCodeVerifier, generateState } from 'arctic';
import { API_ENV } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';
import { deriveKey } from '../../crypto/keys.js';
import { AppError } from '../../errors/app-error.js';
import { Public } from '../public.decorator.js';
import { SessionService } from '../session.service.js';
import { readCookie, SESSION_COOKIE, setSessionCookie } from '../session-cookie.js';
import { GOOGLE_IDENTITY, type GoogleIdentity } from './google-identity.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import {
  clearOAuthCookie,
  decodeTransaction,
  encodeTransaction,
  OAUTH_COOKIE,
  safeReturnTo,
  setOAuthCookie,
} from './oauth-cookie.js';

interface RedirectTarget {
  url: string;
}

@Public()
@ApiTags('Auth')
@Controller({ path: 'auth/google', version: '1' })
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);
  private readonly cookieKey: Buffer;

  constructor(
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentity | null,
    private readonly signIns: GoogleSignInService,
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    this.cookieKey = deriveKey(env.APP_SECRET, 'st_oauth');
  }

  /** Starts the OAuth flow: stores state + PKCE verifier in a signed cookie, then 302 to Google. */
  @Get('start')
  @Redirect()
  @ApiResponse({ status: 302, description: 'To Google; 404 when Google sign-in is off' })
  start(
    @Query('returnTo') returnTo: unknown,
    @Res({ passthrough: true }) res: ServerResponse,
  ): RedirectTarget {
    const google = this.configured();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const transaction = { state, codeVerifier, returnTo: safeReturnTo(returnTo) };
    setOAuthCookie(res, encodeTransaction(this.cookieKey, transaction), this.env);
    return { url: google.authorizationUrl(state, codeVerifier).toString() };
  }

  /** Google redirects here. Every failure is a redirect to the login page with an error code. */
  @Get('callback')
  @Redirect()
  @ApiResponse({ status: 302, description: 'To returnTo when signed in, else /login?error=…' })
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<RedirectTarget> {
    const google = this.configured();
    clearOAuthCookie(res, this.env);
    const { code, state } = query;
    const transaction =
      typeof code === 'string' && typeof state === 'string'
        ? decodeTransaction(this.cookieKey, readCookie(req, OAUTH_COOKIE), state)
        : null;
    if (transaction === null || typeof code !== 'string') return this.failure('OAUTH_FAILED');

    let userId: string;
    try {
      userId = await this.signIns.signIn(await google.exchange(code, transaction.codeVerifier));
    } catch (error) {
      if (error instanceof AppError && error.code === 'ACCOUNT_BLOCKED') {
        return this.failure('ACCOUNT_BLOCKED');
      }
      if (!(error instanceof AppError)) {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
        this.logger.warn({ msg: 'Google sign-in failed', reason });
      }
      return this.failure('OAUTH_FAILED');
    }

    const previous = readCookie(req, SESSION_COOKIE);
    if (previous !== undefined) await this.sessions.revoke(previous);
    const session = await this.sessions.create(userId);
    setSessionCookie(res, session.token, session.expiresAt, this.env);
    return { url: `${this.env.APP_ORIGIN}${transaction.returnTo}` };
  }

  private configured(): GoogleIdentity {
    if (this.google === null) throw new AppError('NOT_FOUND', 404);
    return this.google;
  }

  private failure(code: 'OAUTH_FAILED' | 'ACCOUNT_BLOCKED'): RedirectTarget {
    return { url: `${this.env.APP_ORIGIN}/login?error=${code}` };
  }
}
