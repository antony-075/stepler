import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  operatorAppealDetailSchema,
  operatorAppealIdParamsSchema,
  operatorAppealListQuerySchema,
  operatorAppealPageSchema,
  resolveAppealRequestSchema,
  type OperatorAppealDetail,
  type OperatorAppealListQuery,
  type OperatorAppealPage,
  type ResolveAppealRequest,
} from '@stepler/contracts';
import type { OperatorPrincipal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { AppealResolution } from '../moderation/appeal-resolution.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentOperator } from './current-operator.decorator.js';
import { OperatorAppealQueries } from './operator-appeal-queries.js';
import { NOT_OPERATOR } from './operator-reports.controller.js';
import { OperatorScope } from './operator-scope.js';
import { OperatorGuard } from './operator.guard.js';

/** The console's second queue: the admins' appeals (slice 9b, Q-A6). */
@ApiTags('Operator')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(OperatorGuard)
@Controller({ path: 'operator', version: '1' })
export class OperatorAppealsController {
  constructor(
    private readonly queries: OperatorAppealQueries,
    private readonly scope: OperatorScope,
    private readonly resolution: AppealResolution,
  ) {}

  @Get('appeals')
  @ApiResponse({ status: 200, standardSchema: operatorAppealPageSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: status, cursor or limit' })
  @ApiResponse(NOT_OPERATOR)
  appeals(
    @CurrentOperator() _op: OperatorPrincipal,
    @Query({ schema: operatorAppealListQuerySchema }) query: OperatorAppealListQuery,
  ): Promise<OperatorAppealPage> {
    return this.queries.appeals(query);
  }

  @Get('appeals/:id')
  @ApiResponse({ status: 200, standardSchema: operatorAppealDetailSchema })
  @ApiResponse(NOT_OPERATOR)
  appeal(
    @CurrentOperator() _op: OperatorPrincipal,
    @Param({ schema: operatorAppealIdParamsSchema }) params: { id: string },
  ): Promise<OperatorAppealDetail> {
    return this.queries.appeal(params.id);
  }

  /**
   * «Задовольнити» reverses the measure (unhide, restore, unblock) with an optional note;
   * «Відхилити» keeps it and needs a note the admin reads. Guest reports are not touched.
   */
  @Patch('appeals/:id')
  @ApiResponse({ status: 200, standardSchema: operatorAppealDetailSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: a status, and a 1–500 note on a rejection',
  })
  @ApiResponse(NOT_OPERATOR)
  @ApiResponse({
    status: 409,
    description: 'APPEAL_RESOLVED: already decided the other way (the same way is a no-op)',
  })
  async resolve(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorAppealIdParamsSchema }) params: { id: string },
    @Body({ schema: resolveAppealRequestSchema }) body: ResolveAppealRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorAppealDetail> {
    await this.scope.assertScopedAppeal(params.id);
    await this.resolution.resolve(op, params.id, body, requestId);
    return this.queries.appeal(params.id);
  }
}
