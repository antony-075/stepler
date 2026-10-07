import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type GrantCreate,
  grantCreateSchema,
  type OperatorActionRequest,
  operatorActionRequestSchema,
  type OperatorBillingAccount,
  operatorBillingAccountQuerySchema,
  operatorBillingAccountSchema,
  type OperatorBillingAccountQuery,
  operatorBillingIdParamsSchema,
  type OperatorOfferList,
  operatorOfferListSchema,
  type SubscriptionDto,
  subscriptionDtoSchema,
} from '@stepler/contracts';
import type { OperatorPrincipal } from '../auth/principal.js';
import { GrantsService } from '../billing/grants.service.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentOperator } from './current-operator.decorator.js';
import { OperatorGuard } from './operator.guard.js';
import { NOT_OPERATOR } from './operator-reports.controller.js';

/**
 * Billing in the operator console (ADR 0018): look an account up by e-mail, grant or revoke a
 * complimentary plan [P13]. Billing is not content: no collection content is ever returned.
 */
@ApiTags('Operator')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(OperatorGuard)
@Controller({ path: 'operator/billing', version: '1' })
export class OperatorBillingController {
  constructor(private readonly grants: GrantsService) {}

  @Get('accounts')
  @ApiResponse({ status: 200, standardSchema: operatorBillingAccountSchema })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no account with this e-mail, or not an operator',
  })
  account(
    @CurrentOperator() op: OperatorPrincipal,
    @Query({ schema: operatorBillingAccountQuerySchema }) query: OperatorBillingAccountQuery,
  ): Promise<OperatorBillingAccount> {
    return this.grants.accountByEmail(op, query.email);
  }

  @Get('offers')
  @ApiResponse({ status: 200, standardSchema: operatorOfferListSchema })
  @ApiResponse(NOT_OPERATOR)
  offers(): Promise<OperatorOfferList> {
    return this.grants.offers();
  }

  @Post('grants')
  @ApiResponse({ status: 201, standardSchema: subscriptionDtoSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: not a subscription offer, an end in the past, or no reason',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such account, or not an operator' })
  @ApiResponse({
    status: 409,
    description: 'SUBSCRIPTION_EXISTS: the account pays for a live subscription; cancel it first',
  })
  grant(
    @CurrentOperator() op: OperatorPrincipal,
    @Body({ schema: grantCreateSchema }) body: GrantCreate,
    @RequestId() requestId: string | undefined,
  ): Promise<SubscriptionDto> {
    return this.grants.grant(
      op,
      {
        userId: body.userId,
        offerId: body.offerId,
        endsAt: body.endsAt === null ? null : new Date(body.endsAt),
        reason: body.reason,
      },
      requestId,
    );
  }

  @Post('grants/:id/revoke')
  @ApiResponse({ status: 201, standardSchema: subscriptionDtoSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no live grant with this id, or not an operator',
  })
  revoke(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorBillingIdParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<SubscriptionDto> {
    return this.grants.revoke(op, params.id, body.reason, requestId);
  }
}
