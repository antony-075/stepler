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
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  accountDeletedResponseSchema,
  accountDeletionPreviewResponseSchema,
  authEmailSentResponseSchema,
  authTokenRequestSchema,
  type AccountDeletedResponse,
  type AccountDeletionPreviewResponse,
  type AuthEmailSentResponse,
  type AuthTokenRequest,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { clearSessionCookie } from '../auth/session-cookie.js';
import { SkipLegalGate } from '../auth/skip-legal-gate.decorator.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { AccountDeletionService } from './account-deletion.service.js';

type RequestWithIp = IncomingMessage & { ip?: string };

const TOKEN_ERRORS = {
  status: 400,
  description:
    'AUTH_TOKEN_INVALID: unknown, used or expired; 403 ACCOUNT_BLOCKED; 429 RATE_LIMITED',
};

/** Self-service account deletion (ADR 0020): the signed-in request mails the link. */
@ApiTags('Me')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'me', version: '1' })
export class AccountDeletionRequestController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /** Open before acceptance: someone who declines new documents can still leave. */
  @Post('deletion')
  @SkipLegalGate()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({ status: 202, standardSchema: authEmailSentResponseSchema })
  @ApiResponse({ status: 403, description: 'FORBIDDEN: the operator service account' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: the hourly mail limit of the address' })
  async request(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Req() req: RequestWithIp,
  ): Promise<AuthEmailSentResponse> {
    await this.deletion.request(principal, req.ip);
    return { status: 'sent' };
  }
}

/**
 * The mailed link's page. Public: the link may open in another browser than the one signed in;
 * the token proves the mailbox.
 */
@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller({ path: 'auth/account-deletion', version: '1' })
export class AccountDeletionController {
  constructor(
    private readonly deletion: AccountDeletionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** What the link deletes, before the final confirmation. Uses nothing up. */
  @Public()
  @Post('preview')
  @RateLimit('auth-token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: accountDeletionPreviewResponseSchema })
  @ApiResponse(TOKEN_ERRORS)
  preview(
    @Body({ schema: authTokenRequestSchema }) body: AuthTokenRequest,
  ): Promise<AccountDeletionPreviewResponse> {
    return this.deletion.preview(body.token);
  }

  /** Deletes the account and signs this browser out. */
  @Public()
  @Post('confirm')
  @RateLimit('auth-token')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: accountDeletedResponseSchema })
  @ApiResponse(TOKEN_ERRORS)
  @ApiResponse({ status: 409, description: 'PAYMENT_PENDING: a checkout is still payable' })
  @ApiResponse({
    status: 503,
    description: 'PAYMENT_PROVIDER_UNAVAILABLE: LiqPay did not confirm stopping a subscription',
  })
  async confirm(
    @Body({ schema: authTokenRequestSchema }) body: AuthTokenRequest,
    @Res({ passthrough: true }) res: ServerResponse,
    @RequestId() requestId: string | undefined,
  ): Promise<AccountDeletedResponse> {
    await this.deletion.confirm(body.token, requestId);
    clearSessionCookie(res, this.env);
    return { status: 'deleted' };
  }
}
