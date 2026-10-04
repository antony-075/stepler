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
  collectionIdParamsSchema,
  collectionSchema,
  coverUploadParamsSchema,
  createUploadRequestSchema,
  uploadPartsRequestSchema,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
  type Collection,
  type CreateUploadRequest,
  type UploadPartsRequest,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import type { z } from 'zod';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CoverUploadsService } from './cover-uploads.service.js';

type CollectionIdParams = z.infer<typeof collectionIdParamsSchema>;
type CoverUploadParams = z.infer<typeof coverUploadParamsSchema>;

const RATE_LIMITED = 'RATE_LIMITED: calls per IP or per user (see Retry-After)';

/**
 * The collection cover, set by its owner (slice 8a, [A1]): the cover file goes to storage the
 * way guest files do (a multipart upload session, verified at completion), under the admin
 * session. Only the owner's own collection and own uploads are reachable; anything else is
 * `404`. Every route also keeps the CSRF origin check (unsafe methods).
 */
@ApiTags('Collections')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
// The global auth guard runs first (the per-user limit is keyed by the principal).
@UseGuards(RateLimitGuard)
@Controller({ path: 'collections/:id/cover', version: '1' })
export class CoverController {
  constructor(private readonly uploads: CoverUploadsService) {}

  /** Opens a cover upload (photos only); the same `clientUploadId` and file returns the open one. */
  @Post('uploads')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: uploadSessionResponseSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not the owner’s collection' })
  @ApiResponse({
    status: 409,
    description:
      'COLLECTION_ARCHIVED (no cover changes while archived), QUOTA_EXCEEDED (collection or account full), IDEMPOTENCY_CONFLICT (clientUploadId used for another file), UPLOAD_CLOSED',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED (a retry of an expired upload)' })
  @ApiResponse({
    status: 422,
    description: 'FILE_TYPE_NOT_ALLOWED (a cover is a photo), FILE_TOO_LARGE',
  })
  @ApiResponse({
    status: 429,
    description: `${RATE_LIMITED}, or more than 3 cover uploads open in this collection`,
  })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  initiate(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: createUploadRequestSchema }) body: CreateUploadRequest,
  ): Promise<UploadSessionResponse> {
    return this.uploads.initiate(principal, params.id, body);
  }

  @Post('uploads/:uploadId/parts')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: uploadPartsResponseSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: parts beyond partCount' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such cover upload of this owner' })
  @ApiResponse({ status: 409, description: 'UPLOAD_CLOSED, UPLOAD_IN_PROGRESS (retryable)' })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  parts(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: coverUploadParamsSchema }) params: CoverUploadParams,
    @Body({ schema: uploadPartsRequestSchema }) body: UploadPartsRequest,
  ): Promise<UploadPartsResponse> {
    return this.uploads.presignParts(principal, params.id, params.uploadId, body.partNumbers);
  }

  /**
   * Verifies the upload and makes it the cover (replacing the current one). Answers the
   * collection, with `cover.status = PENDING` until the worker made the previews. A repeat
   * returns the collection as it is now.
   */
  @Post('uploads/:uploadId/complete')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: collectionSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such cover upload of this owner' })
  @ApiResponse({
    status: 409,
    description:
      'UPLOAD_INCOMPLETE (with missingPartNumbers; retry after sending them), UPLOAD_IN_PROGRESS (another completion is checking it; retryable), UPLOAD_CLOSED, COLLECTION_ARCHIVED (archived meanwhile; the upload is rejected)',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED' })
  @ApiResponse({
    status: 422,
    description: 'UPLOAD_SIZE_MISMATCH, FILE_TYPE_NOT_ALLOWED (content)',
  })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  complete(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: coverUploadParamsSchema }) params: CoverUploadParams,
  ): Promise<Collection> {
    return this.uploads.complete(principal, params.id, params.uploadId);
  }

  /** Idempotent; allowed while archived (it only frees space). */
  @Delete('uploads/:uploadId')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Cancelled (or already cancelled)' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such cover upload of this owner' })
  @ApiResponse({
    status: 409,
    description:
      'UPLOAD_CLOSED: already completed; UPLOAD_IN_PROGRESS: being completed (retryable)',
  })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  cancel(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: coverUploadParamsSchema }) params: CoverUploadParams,
  ): Promise<void> {
    return this.uploads.cancel(principal, params.id, params.uploadId);
  }
}
