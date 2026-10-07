import type { ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createReportRequestSchema,
  createReportResponseSchema,
  guestContentParamsSchema,
  type CreateReportRequest,
  type CreateReportResponse,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { parseIdempotencyKey } from '../common/idempotency-key.js';
import { CurrentGuest } from '../guest-access/current-guest.decorator.js';
import { GuestSessionGuard } from '../guest-access/guest-session.guard.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { GUEST_SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { ReportsService } from './reports.service.js';

interface GuestContentParams {
  collectionId: string;
  id: string;
}

/**
 * «Поскаржитися» (slice 9, R1): a guest reports another guest's frame they can see. Behind the
 * guest session like every guest content route; the per-IP hourly limit runs first.
 */
@ApiTags('Moderation')
@ApiCookieAuth(GUEST_SESSION_COOKIE_SCHEME)
@Public()
@UseGuards(RateLimitGuard, GuestSessionGuard)
@Controller({ path: 'guest/collections/:collectionId', version: '1' })
export class GuestReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('content/:id/reports')
  @RateLimit('guest-report')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'A UUID per opened form' })
  @ApiResponse({ status: 201, standardSchema: createReportResponseSchema })
  @ApiResponse({
    status: 200,
    description:
      'A retry with the same Idempotency-Key and body, or this session already has an open report on the frame: that report',
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED' })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 403,
    description: "FORBIDDEN (the guest's own frame), COLLECTION_ARCHIVED or LINK_INACTIVE",
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no such frame the guest can see (hidden and deleted included)',
  })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT: the key was used for another report',
  })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED: reports per session per hour, or per client IP per hour',
  })
  async create(
    @CurrentGuest() guest: GuestPrincipal,
    @Param({ schema: guestContentParamsSchema }) params: GuestContentParams,
    @Body({ schema: createReportRequestSchema }) body: CreateReportRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @RequestId() requestId: string | undefined,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<CreateReportResponse> {
    const { id, created } = await this.reports.create(
      guest,
      params.id,
      body,
      parseIdempotencyKey(idempotencyKey),
      requestId,
    );
    if (!created) res.statusCode = HttpStatus.OK;
    return { id };
  }
}
