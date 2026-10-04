import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type LegalAcceptanceRequest,
  legalAcceptanceRequestSchema,
  type MeResponse,
  meResponseSchema,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { SkipLegalGate } from '../auth/skip-legal-gate.decorator.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { UsersService } from './users.service.js';

/**
 * The fallback acceptance (ADR 0016): accounts from before the sign-in checkbox, a link whose
 * versions went stale, and forced re-acceptance. Acceptance normally happens at sign-in.
 */
@ApiTags('Me')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'me/legal-acceptances', version: '1' })
export class LegalAcceptancesController {
  constructor(private readonly users: UsersService) {}

  /** Idempotent: accepting a version already accepted changes nothing. */
  @Post()
  @SkipLegalGate()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: meResponseSchema })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED, or LEGAL_VERSION_OUTDATED (refetch GET /me and retry); nothing is written',
  })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  accept(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Body({ schema: legalAcceptanceRequestSchema }) body: LegalAcceptanceRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<MeResponse> {
    return this.users.acceptLegal(principal, body, requestId);
  }
}
