import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  meResponseSchema,
  updateMeRequestSchema,
  usageResponseSchema,
  type MeResponse,
  type UpdateMeRequest,
  type UsageResponse,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { SkipLegalGate } from '../auth/skip-legal-gate.decorator.js';
import { UsageService } from '../limits/usage.service.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { UsersService } from './users.service.js';

@ApiTags('Me')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly usage: UsageService,
  ) {}

  /** Open before acceptance: the web redirects on `legal.accepted` (ADR 0016). */
  @Get()
  @SkipLegalGate()
  @ApiResponse({ status: 200, standardSchema: meResponseSchema })
  me(@CurrentPrincipal() principal: AccountPrincipal): Promise<MeResponse> {
    return this.users.me(principal);
  }

  /**
   * Passes the acceptance gate for the fallback page's language switch; before acceptance the
   * service allows only `locale` (`displayName` → 403 LEGAL_ACCEPTANCE_REQUIRED).
   */
  @Patch()
  @SkipLegalGate()
  @ApiResponse({ status: 200, standardSchema: meResponseSchema })
  @ApiResponse({
    status: 403,
    description: 'LEGAL_ACCEPTANCE_REQUIRED: only `locale` may change before acceptance',
  })
  update(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Body({ schema: updateMeRequestSchema }) body: UpdateMeRequest,
  ): Promise<MeResponse> {
    return this.users.updateMe(principal, body);
  }

  /** The account's usage against its limits, for the dashboard counter. */
  @Get('usage')
  @ApiResponse({ status: 200, standardSchema: usageResponseSchema })
  usageOf(@CurrentPrincipal() principal: AccountPrincipal): Promise<UsageResponse> {
    return this.usage.forUser(principal.userId);
  }
}
