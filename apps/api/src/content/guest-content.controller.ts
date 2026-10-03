import type { ServerResponse } from 'node:http';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createTextRequestSchema,
  guestContentItemSchema,
  idempotencyKeyHeaderSchema,
  type CreateTextRequest,
  type GuestContentItem,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import { AppError } from '../errors/app-error.js';
import { CurrentGuest } from '../guest-access/current-guest.decorator.js';
import { GuestSessionGuard } from '../guest-access/guest-session.guard.js';
import { GUEST_SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { TextsService } from './texts.service.js';

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
@UseGuards(GuestSessionGuard)
@Controller({ path: 'guest/collections/:collectionId', version: '1' })
export class GuestContentController {
  constructor(private readonly texts: TextsService) {}

  @Post('texts')
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
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT: the key was used for another text',
  })
  @ApiResponse({ status: 410, description: 'COLLECTION_UNAVAILABLE, or LINK_REVOKED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: texts per session per hour' })
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
