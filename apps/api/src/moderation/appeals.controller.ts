import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  adminAppealListSchema,
  adminAppealSchema,
  collectionContentParamsSchema,
  collectionIdParamsSchema,
  createAppealRequestSchema,
  type AdminAppeal,
  type AdminAppealList,
  type CreateAppealRequest,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { AppealsService } from './appeals.service.js';

const NOT_FOUND = {
  status: 404,
  description: "NOT_FOUND: not the admin's collection or frame, deleted, or being deleted",
} as const;
const BAD_TEXT = { status: 400, description: 'VALIDATION_FAILED: a 1–1000 character text' };
const RATE_LIMITED = {
  status: 429,
  description: 'RATE_LIMITED: LIMIT_APPEALS_PER_ACCOUNT_PER_DAY appeals in 24 hours',
};

/**
 * The collection admin's appeals on the operator's measures (slice 9b, Q-A2): a frame the operator
 * hid or quarantined, or the block of the collection. Owner scope only; anything else is `404`.
 * The status comes back in-app only (no mail to the admin).
 */
@ApiTags('Moderation')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'collections', version: '1' })
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post(':id/content/:itemId/appeals')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: adminAppealSchema })
  @ApiResponse(BAD_TEXT)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'APPEAL_OPEN: already under review; APPEAL_NOT_APPLICABLE: the operator has not hidden or deleted the frame',
  })
  @ApiResponse(RATE_LIMITED)
  createForContent(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionContentParamsSchema }) params: { id: string; itemId: string },
    @Body({ schema: createAppealRequestSchema }) body: CreateAppealRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<AdminAppeal> {
    return this.appeals.createForContent(principal, params.id, params.itemId, body.text, requestId);
  }

  @Post(':id/appeals')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: adminAppealSchema })
  @ApiResponse(BAD_TEXT)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'APPEAL_OPEN: already under review; APPEAL_NOT_APPLICABLE: the collection is not blocked',
  })
  @ApiResponse(RATE_LIMITED)
  createForCollection(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: { id: string },
    @Body({ schema: createAppealRequestSchema }) body: CreateAppealRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<AdminAppeal> {
    return this.appeals.createForCollection(principal, params.id, body.text, requestId);
  }

  /** The collection's appeals (its frames and itself), newest first, at most 50. */
  @Get(':id/appeals')
  @ApiResponse({ status: 200, standardSchema: adminAppealListSchema })
  @ApiResponse(NOT_FOUND)
  async list(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: { id: string },
  ): Promise<AdminAppealList> {
    return { items: await this.appeals.listForAdmin(principal, params.id) };
  }
}
