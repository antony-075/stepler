import type { ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createTextRequestSchema,
  guestContentDetailSchema,
  guestContentItemSchema,
  guestContentListQuerySchema,
  guestContentPageSchema,
  guestContentParamsSchema,
  idempotencyKeyHeaderSchema,
  type CreateTextRequest,
  type GuestContentDetail,
  type GuestContentItem,
  type GuestContentListQuery,
  type GuestContentPage,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { AppError } from '../errors/app-error.js';
import { CurrentGuest } from '../guest-access/current-guest.decorator.js';
import { GuestSessionGuard } from '../guest-access/guest-session.guard.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { GUEST_SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { GuestContentService } from './guest-content.service.js';
import { TextsService } from './texts.service.js';

interface GuestContentParams {
  collectionId: string;
  id: string;
}

/** The `Idempotency-Key` header: required, one UUID per draft. */
function parseIdempotencyKey(value: string | undefined): string {
  const parsed = idempotencyKeyHeaderSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new AppError('VALIDATION_FAILED', 400, {
    errors: [{ path: ['Idempotency-Key'], message: 'A UUID is required' }],
  });
}

/**
 * A guest's content in one collection. `GuestSessionGuard` resolves the session from the
 * `st_gs` cookie and re-checks its link and collection; every query is scoped to them.
 */
@ApiTags('Guest')
@ApiCookieAuth(GUEST_SESSION_COOKIE_SCHEME)
@Public()
// The per-IP limit first, so a flood is refused before any session lookup.
@UseGuards(RateLimitGuard, GuestSessionGuard)
@Controller({ path: 'guest/collections/:collectionId', version: '1' })
export class GuestContentController {
  constructor(
    private readonly texts: TextsService,
    private readonly content: GuestContentService,
  ) {}

  /** `own`: this browser's items; `all`: everyone's, only with the shared gallery [C16]. */
  @Get('content')
  @RateLimit('guest-read')
  @ApiResponse({ status: 200, standardSchema: guestContentPageSchema })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 403,
    description:
      'FORBIDDEN (scope=all without the shared gallery), COLLECTION_ARCHIVED or LINK_INACTIVE',
  })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  list(
    @CurrentGuest() guest: GuestPrincipal,
    @Query({ schema: guestContentListQuerySchema }) query: GuestContentListQuery,
  ): Promise<GuestContentPage> {
    return this.content.list(guest, query);
  }

  @Get('content/:id')
  @RateLimit('guest-read')
  @ApiResponse({ status: 200, standardSchema: guestContentDetailSchema })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no such item in this collection, or one the guest may not see',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  get(
    @CurrentGuest() guest: GuestPrincipal,
    @Param({ schema: guestContentParamsSchema }) params: GuestContentParams,
  ): Promise<GuestContentDetail> {
    return this.content.get(guest, params.id);
  }

  /** The guest's own item, when the link allows it [C15]; idempotent. */
  @Delete('content/:id')
  @RateLimit('guest-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description: 'Deleted, or already deleted (idempotent); gone for the admin too at once',
  })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 403,
    description:
      'FORBIDDEN (an own item, but the link does not let guests delete), COLLECTION_ARCHIVED or LINK_INACTIVE',
  })
  @ApiResponse({
    status: 404,
    description: "NOT_FOUND: no such item in this collection, or another guest's",
  })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: per-IP limit; see Retry-After' })
  delete(
    @CurrentGuest() guest: GuestPrincipal,
    @Param({ schema: guestContentParamsSchema }) params: GuestContentParams,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.content.delete(guest, params.id, requestId);
  }

  @Post('texts')
  @RateLimit('guest-text-create')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'A UUID per draft' })
  @ApiResponse({ status: 201, standardSchema: guestContentItemSchema })
  @ApiResponse({
    status: 200,
    description: 'A retry with the same Idempotency-Key and body: the item created first',
  })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN (the link takes no texts), COLLECTION_ARCHIVED or LINK_INACTIVE',
  })
  @ApiResponse({
    status: 404,
    description: 'CONTENT_NOT_FOUND: a retry of a text the admin has deleted since',
  })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT: the key was used for another text',
  })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED: texts per session per hour, or per client IP per minute',
  })
  async createText(
    @CurrentGuest() guest: GuestPrincipal,
    @Body({ schema: createTextRequestSchema }) body: CreateTextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<GuestContentItem> {
    const { item, created } = await this.texts.create(
      guest,
      body.body,
      parseIdempotencyKey(idempotencyKey),
    );
    if (!created) res.statusCode = HttpStatus.OK;
    return item;
  }
}
