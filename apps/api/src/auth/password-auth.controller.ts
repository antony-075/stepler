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
  authEmailRequestSchema,
  authEmailSentResponseSchema,
  authTokenRequestSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  signedInResponseSchema,
  verificationPreviewResponseSchema,
  type AuthEmailRequest,
  type AuthEmailSentResponse,
  type AuthTokenRequest,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SignedInResponse,
  type VerificationPreviewResponse,
} from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { PasswordAuthService } from './password-auth.service.js';
import type { AccountPrincipal } from './principal.js';
import { Public } from './public.decorator.js';
import { RateLimit, RateLimitGuard } from './rate-limit.js';
import { SessionService } from './session.service.js';
import { readCookie, SESSION_COOKIE, setSessionCookie } from './session-cookie.js';

type RequestWithIp = IncomingMessage & { ip?: string };

const SENT = { status: 202, standardSchema: authEmailSentResponseSchema };
const MAIL_ERRORS = {
  status: 400,
  description: 'VALIDATION_FAILED or TURNSTILE_FAILED; 429 RATE_LIMITED (per IP, after Turnstile)',
};
const TOKEN_ERRORS = {
  status: 400,
  description:
    'AUTH_TOKEN_INVALID: unknown, used or expired; 403 ACCOUNT_BLOCKED; 429 RATE_LIMITED',
};

/** E-mail + password accounts (ADR 0019). Every route but the password change is public. */
@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller({ path: 'auth', version: '1' })
export class PasswordAuthController {
  constructor(
    private readonly accounts: PasswordAuthService,
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** Creates the account (unverified) and mails the confirmation. Same `202` for any address. */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse(SENT)
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED (the password rules, or without `legal`), TURNSTILE_FAILED, LEGAL_VERSION_OUTDATED; 429 RATE_LIMITED',
  })
  async register(
    @Body({ schema: registerRequestSchema }) body: RegisterRequest,
    @Req() req: RequestWithIp,
    @RequestId() requestId: string | undefined,
  ): Promise<AuthEmailSentResponse> {
    await this.accounts.register(body, req.ip, requestId);
    return { status: 'sent' };
  }

  /** Sets the session cookie. */
  @Public()
  @Post('login')
  @RateLimit('auth-login')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: signedInResponseSchema })
  @ApiResponse({
    status: 401,
    description: 'INVALID_CREDENTIALS: an unknown address or a wrong password (one answer)',
  })
  @ApiResponse({
    status: 403,
    description:
      'EMAIL_NOT_VERIFIED (the right password, the address not confirmed yet), ACCOUNT_BLOCKED',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per IP, or failures per address' })
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Req() req: RequestWithIp,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<SignedInResponse> {
    const userId = await this.accounts.login(body, req.ip);
    return this.signIn(req, res, userId);
  }

  /** Mails the confirmation again to an unverified account. Same `202` for any address. */
  @Public()
  @Post('verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse(SENT)
  @ApiResponse(MAIL_ERRORS)
  async resendVerification(
    @Body({ schema: authEmailRequestSchema }) body: AuthEmailRequest,
    @Req() req: RequestWithIp,
  ): Promise<AuthEmailSentResponse> {
    await this.accounts.resendVerification(body, req.ip);
    return { status: 'sent' };
  }

  /** The address a confirmation link is for. Does not use the link (scanners open links). */
  @Public()
  @Post('verification/preview')
  @RateLimit('auth-token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: verificationPreviewResponseSchema })
  @ApiResponse(TOKEN_ERRORS)
  preview(
    @Body({ schema: authTokenRequestSchema }) body: AuthTokenRequest,
  ): Promise<VerificationPreviewResponse> {
    return this.accounts.previewVerification(body.token);
  }

  /** Uses the link: the address is confirmed and the session cookie set. */
  @Public()
  @Post('verification/confirm')
  @RateLimit('auth-token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: signedInResponseSchema })
  @ApiResponse(TOKEN_ERRORS)
  async confirm(
    @Body({ schema: authTokenRequestSchema }) body: AuthTokenRequest,
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
    @RequestId() requestId: string | undefined,
  ): Promise<SignedInResponse> {
    const userId = await this.accounts.confirmVerification(body.token, requestId);
    return this.signIn(req, res, userId);
  }

  /** Mails a link to set a new password. Same `202` for any address. */
  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse(SENT)
  @ApiResponse(MAIL_ERRORS)
  async forgot(
    @Body({ schema: authEmailRequestSchema }) body: AuthEmailRequest,
    @Req() req: RequestWithIp,
  ): Promise<AuthEmailSentResponse> {
    await this.accounts.forgotPassword(body, req.ip);
    return { status: 'sent' };
  }

  /** Sets the password from the link, ends every session, signs in. */
  @Public()
  @Post('password/reset')
  @RateLimit('auth-token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: signedInResponseSchema })
  @ApiResponse({
    ...TOKEN_ERRORS,
    description: `VALIDATION_FAILED (the rules); ${TOKEN_ERRORS.description}`,
  })
  async reset(
    @Body({ schema: resetPasswordRequestSchema }) body: ResetPasswordRequest,
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
    @RequestId() requestId: string | undefined,
  ): Promise<SignedInResponse> {
    const userId = await this.accounts.resetPassword(body.token, body.password, requestId);
    return this.signIn(req, res, userId);
  }

  /** Signed in: changes the password; every other session ends. */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Changed; this session stays signed in' })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED (the rules), CURRENT_PASSWORD_INVALID (also for an account without a password: it sets one through the reset link); 429 RATE_LIMITED',
  })
  async change(
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
    @CurrentPrincipal() principal: AccountPrincipal,
    @Req() req: IncomingMessage,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    await this.accounts.changePassword(
      principal.userId,
      body.currentPassword,
      body.newPassword,
      readCookie(req, SESSION_COOKIE),
      requestId,
    );
  }

  /** A new session replaces the request's one. */
  private async signIn(
    req: IncomingMessage,
    res: ServerResponse,
    userId: string,
  ): Promise<SignedInResponse> {
    const previous = readCookie(req, SESSION_COOKIE);
    if (previous !== undefined) await this.sessions.revoke(previous);
    const session = await this.sessions.create(userId);
    setSessionCookie(res, session.token, session.expiresAt, this.env);
    return { status: 'signed-in' };
  }
}
