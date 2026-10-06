import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { operatorActionRequestSchema, type OperatorActionRequest } from '@stepler/contracts';
import { z } from 'zod';
import type { OperatorPrincipal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CurrentOperator } from './current-operator.decorator.js';
import { OperatorGuard } from './operator.guard.js';
import { OperatorActions } from './operator-actions.service.js';
import { NOT_OPERATOR } from './operator-reports.controller.js';

const idParamsSchema = z.object({ id: z.uuid() });

const DONE = { status: 204, description: 'Done, or already so (idempotent); audited once' };
const BAD_REASON = { status: 400, description: 'VALIDATION_FAILED: a 1–500 reason is required' };

/**
 * The operator's actions (R5), each with a reason, on reported scope only ([P5]). Deleting is a
 * `POST` because the reason is a body.
 */
@ApiTags('Operator')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(OperatorGuard)
@Controller({ path: 'operator', version: '1' })
export class OperatorActionsController {
  constructor(private readonly actions: OperatorActions) {}

  @Post('content/:id/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  hide(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.hide(op, params.id, body.reason, requestId);
  }

  @Post('content/:id/unhide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  unhide(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.unhide(op, params.id, body.reason, requestId);
  }

  @Post('content/:id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  delete(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.delete(op, params.id, body.reason, requestId);
  }

  @Post('collections/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  blockCollection(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.blockCollection(op, params.id, body.reason, requestId);
  }

  @Post('collections/:id/unblock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  unblockCollection(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.unblockCollection(op, params.id, body.reason, requestId);
  }

  @Post('users/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  blockAccount(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.blockAccount(op, params.id, body.reason, requestId);
  }

  @Post('users/:id/unblock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse(DONE)
  @ApiResponse(BAD_REASON)
  @ApiResponse(NOT_OPERATOR)
  unblockAccount(
    @CurrentOperator() op: OperatorPrincipal,
    @Param({ schema: idParamsSchema }) params: { id: string },
    @Body({ schema: operatorActionRequestSchema }) body: OperatorActionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.actions.unblockAccount(op, params.id, body.reason, requestId);
  }
}
