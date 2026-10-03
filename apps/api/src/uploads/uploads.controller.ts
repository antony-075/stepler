import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createUploadRequestSchema,
  guestContentItemSchema,
  guestUploadParamsSchema,
  uploadPartsRequestSchema,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
  type CreateUploadRequest,
  type GuestContentItem,
  type UploadPartsRequest,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import { z } from 'zod';
import type { GuestPrincipal } from '../auth/principal.js';
import { Public } from '../auth/public.decorator.js';
import type { AppError } from '../errors/app-error.js';
import { CurrentGuest } from '../guest-access/current-guest.decorator.js';
import {
  AllowClosedLink,
  GuestLinkClosed,
  GuestSessionGuard,
} from '../guest-access/guest-session.guard.js';
import { GUEST_SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { UploadCompletion } from './upload-completion.js';
import { UploadsService } from './uploads.service.js';

type UploadParams = z.infer<typeof guestUploadParamsSchema>;

const STATE_ERRORS =
  'COLLECTION_UNAVAILABLE or LINK_REVOKED (410), COLLECTION_ARCHIVED or LINK_INACTIVE (403)';

/**
 * Direct uploads of a guest in one collection (spec §10, ADR 0008). Bytes never pass through
 * the API: it signs URLs for storage and verifies the result. Only the guest's own uploads are
 * reachable; another guest's id is `404`.
 */
@ApiTags('Uploads')
@ApiCookieAuth(GUEST_SESSION_COOKIE_SCHEME)
@Public()
@UseGuards(GuestSessionGuard)
@Controller({ path: 'guest/collections/:collectionId/uploads', version: '1' })
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly completion: UploadCompletion,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: uploadSessionResponseSchema })
  @ApiResponse({ status: 401, description: 'GUEST_SESSION_REQUIRED' })
  @ApiResponse({
    status: 403,
    description: `FORBIDDEN (the link takes no such files), ${STATE_ERRORS}`,
  })
  @ApiResponse({
    status: 409,
    description:
      'QUOTA_EXCEEDED (collection or account full), IDEMPOTENCY_CONFLICT (clientUploadId used for another file), UPLOAD_CLOSED',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED (a retry of an expired upload)' })
  @ApiResponse({ status: 422, description: 'FILE_TYPE_NOT_ALLOWED, FILE_TOO_LARGE' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: uploads per hour or open at once' })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  initiate(
    @CurrentGuest() guest: GuestPrincipal,
    @Body({ schema: createUploadRequestSchema }) body: CreateUploadRequest,
  ): Promise<UploadSessionResponse> {
    return this.uploads.initiate(guest, body);
  }

  @Post(':uploadId/parts')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: uploadPartsResponseSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: a single PUT, or parts beyond partCount',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such upload of this guest' })
  @ApiResponse({ status: 409, description: 'UPLOAD_CLOSED' })
  @ApiResponse({ status: 410, description: `UPLOAD_EXPIRED; ${STATE_ERRORS}` })
  parts(
    @CurrentGuest() guest: GuestPrincipal,
    @Param({ schema: guestUploadParamsSchema }) params: UploadParams,
    @Body({ schema: uploadPartsRequestSchema }) body: UploadPartsRequest,
  ): Promise<UploadPartsResponse> {
    return this.uploads.presignParts(guest, params.uploadId, body.partNumbers);
  }

  /**
   * Verifies and records the upload. A repeat returns the same frame. Runs even when the link
   * has closed meanwhile, so the refusal is recorded and the bytes discarded.
   */
  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.OK)
  @AllowClosedLink()
  @ApiResponse({ status: 200, standardSchema: guestContentItemSchema })
  @ApiResponse({
    status: 403,
    description: `FORBIDDEN (the file type was switched off); ${STATE_ERRORS}`,
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND, or CONTENT_NOT_FOUND (completed, since deleted)',
  })
  @ApiResponse({
    status: 409,
    description:
      'UPLOAD_INCOMPLETE (with missingPartNumbers for multipart; retry after sending them), UPLOAD_CLOSED',
  })
  @ApiResponse({ status: 410, description: `UPLOAD_EXPIRED; ${STATE_ERRORS}` })
  @ApiResponse({
    status: 422,
    description: 'UPLOAD_SIZE_MISMATCH, FILE_TYPE_NOT_ALLOWED (content)',
  })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  complete(
    @CurrentGuest() guest: GuestPrincipal,
    @GuestLinkClosed() closed: AppError | null,
    @Param({ schema: guestUploadParamsSchema }) params: UploadParams,
  ): Promise<GuestContentItem> {
    return this.completion.complete(guest, params.uploadId, closed);
  }

  /** Idempotent; allowed after the link closed (it only frees space). */
  @Delete(':uploadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowClosedLink()
  @ApiResponse({ status: 204, description: 'Cancelled (or already cancelled)' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such upload of this guest' })
  @ApiResponse({ status: 409, description: 'UPLOAD_CLOSED: already completed' })
  cancel(
    @CurrentGuest() guest: GuestPrincipal,
    @Param({ schema: guestUploadParamsSchema }) params: UploadParams,
  ): Promise<void> {
    return this.uploads.cancel(guest, params.uploadId);
  }
}
