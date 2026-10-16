import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, Get, Inject, Logger, Query, Redirect, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { isCurrentLegalVersions, legalVersionsSchema } from '@stepler/contracts';
import { generateCodeVerifier, generateState } from 'arctic';
import { API_ENV } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';
import { deriveKey } from '../../crypto/keys.js';
import { AppError } from '../../errors/app-error.js';
import { RequestId } from '../../logging/request-id.decorator.js';
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

  /**
   * Starts the OAuth flow: stores state, PKCE verifier and the accepted legal versions (the
   * registration form's checkbox, ADR 0016) in a signed cookie, then 302 to Google. From the
   * sign-in form the versions are absent (`null`: a new account then accepts on the fallback
   * page); given but invalid or not current, it goes back to the login page with an error and
   * sets no cookie, so Google is never contacted.
   */
  @Get('start')
  @Redirect()
  @ApiResponse({
    status: 302,
    description:
      'To Google; to /login?error=LEGAL_ACCEPTANCE_REQUIRED with invalid `terms`/`privacy` or when started cross-site (`Sec-Fetch-Site: cross-site`), or /login?error=LEGAL_VERSION_OUTDATED when they are not current; 404 when Google sign-in is off',
  })
  start(
    @Req() req: IncomingMessage,
    @Query('returnTo') returnTo: unknown,
    @Query('terms') terms: unknown,
    @Query('privacy') privacy: unknown,
    @Res({ passthrough: true }) res: ServerResponse,
  ): RedirectTarget {
    const google = this.configured();
    // The versions stand for a tick on our own card: a start launched from another site (a
    // link or a form elsewhere, `Sec-Fetch-Site: cross-site`) cannot carry that acceptance.
    // Older browsers send no header and are allowed.
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      return this.failure('LEGAL_ACCEPTANCE_REQUIRED');
    }
    let accepted = null;
    if (terms !== undefined || privacy !== undefined) {
      const legal = legalVersionsSchema.safeParse({ terms, privacy });
      if (!legal.success) return this.failure('LEGAL_ACCEPTANCE_REQUIRED');
      if (!isCurrentLegalVersions(legal.data)) return this.failure('LEGAL_VERSION_OUTDATED');
      accepted = legal.data;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const transaction = {
      state,
      codeVerifier,
      returnTo: safeReturnTo(returnTo),
      legal: accepted,
    };
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
    @RequestId() requestId: string | undefined,
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
      const claims = await google.exchange(code, transaction.codeVerifier);
      userId = await this.signIns.signIn(claims, transaction.legal, requestId);
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

  private failure(
    code:
      'OAUTH_FAILED' | 'ACCOUNT_BLOCKED' | 'LEGAL_ACCEPTANCE_REQUIRED' | 'LEGAL_VERSION_OUTDATED',
  ): RedirectTarget {
    return { url: `${this.env.APP_ORIGIN}/login?error=${code}` };
  }
}
