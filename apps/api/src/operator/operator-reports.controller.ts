import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  operatorReportDetailSchema,
  operatorReportIdParamsSchema,
  operatorReportListQuerySchema,
  operatorReportPageSchema,
  operatorSessionSchema,
  resolveReportRequestSchema,
  type OperatorReportDetail,
  type OperatorReportListQuery,
  type OperatorReportPage,
  type OperatorSession,
  type ResolveReportRequest,
} from '@stepler/contracts';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { ReportResolution } from '../moderation/report-resolution.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentOperator } from './current-operator.decorator.js';
import { OperatorGuard } from './operator.guard.js';
import { OperatorQueries } from './operator-queries.js';

export const NOT_OPERATOR = {
  status: 404,
  description: 'NOT_FOUND: not the Stepler operator, or nothing reported by that id',
} as const;

/** The operator console's session and report queue (R4–R6). */
@ApiTags('Operator')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(OperatorGuard)
@Controller({ path: 'operator', version: '1' })
export class OperatorReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: OperatorQueries,
    private readonly resolution: ReportResolution,
  ) {}

  /** The signed-in service account; `404` for anyone else, so the console can tell. */
  @Get('session')
  @ApiResponse({ status: 200, standardSchema: operatorSessionSchema })
  @ApiResponse(NOT_OPERATOR)
  async session(@CurrentOperator() op: OperatorPrincipal): Promise<OperatorSession> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: op.userId },
      select: { email: true },
    });
    return { email: user.email };
  }

  @Get('reports')
  @ApiResponse({ status: 200, standardSchema: operatorReportPageSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: status, cursor or limit' })
  @ApiResponse(NOT_OPERATOR)
  reports(
    @CurrentOperator() _op: OperatorPrincipal,
    @Query({ schema: operatorReportListQuerySchema }) query: OperatorReportListQuery,
  ): Promise<OperatorReportPage> {
    return this.queries.reports(query);
  }

  @Get('reports/:id')
  @ApiResponse({ status: 200, standardSchema: operatorReportDetailSchema })
  @ApiResponse(NOT_OPERATOR)
  report(
    @CurrentOperator() _op: OperatorPrincipal,
    @Param({ schema: operatorReportIdParamsSchema }) params: { id: string },
  ): Promise<OperatorReportDetail> {
    return this.queries.report(params.id);
  }

  /**
   * «Вжито заходів» / «Відхилити» ([P2]): every open report on the same frame gets the decision
   * and the note; reporters who left an address get the decision mail.
   */
  @Patch('reports/:id')
  @ApiResponse({ status: 200, standardSchema: operatorReportDetailSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: a status and a 1–500 note' })
  @ApiResponse(NOT_OPERATOR)
  @ApiResponse({
    status: 409,
    description: 'REPORT_RESOLVED: already decided the other way (the same way is a no-op)',
  })
  async resolve(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: operatorReportIdParamsSchema }) params: { id: string },
    @Body({ schema: resolveReportRequestSchema }) body: ResolveReportRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<OperatorReportDetail> {
    await this.resolution.resolve(op, params.id, body, requestId);
    return this.queries.report(params.id);
  }
}
