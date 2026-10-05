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
  setCoverFromFrameRequestSchema,
  uploadPartsRequestSchema,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
  type Collection,
  type CreateUploadRequest,
  type SetCoverFromFrameRequest,
  type UploadPartsRequest,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import type { z } from 'zod';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CollectionImagesService, type ImageTarget } from '../images/collection-images.service.js';
import { ImageUploadsService } from '../images/image-uploads.service.js';
import { CollectionsService } from '../collections/collections.service.js';

type CollectionIdParams = z.infer<typeof collectionIdParamsSchema>;
type CoverUploadParams = z.infer<typeof coverUploadParamsSchema>;

const RATE_LIMITED = 'RATE_LIMITED: calls per IP or per user (see Retry-After)';

/** «Картинка колекції»: the collection's own image, never part of the guest page. */
const COLLECTION_IMAGE: ImageTarget = { slot: 'COLLECTION_IMAGE' };

/**
 * «Картинка колекції» (plan Task 10, ADR 0017): an image of the collection only its owner sees,
 * on the dashboard and in the share dialog. Set from an uploaded photo (a multipart upload
 * session like the guest page images, verified at completion) or copied from a guest photo
 * frame; removed whole. Owner only under the admin session (anything else is `404`), the CSRF
 * origin check on unsafe methods, no change on an archived collection [A6]. It never appears in
 * a guest response: the guest page has its own cover.
 */
@ApiTags('Collections')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
// The global auth guard runs first (the per-user limit is keyed by the principal).
@UseGuards(RateLimitGuard)
@Controller({ path: 'collections/:id/image', version: '1' })
export class CollectionImageController {
  constructor(
    private readonly uploads: ImageUploadsService,
    private readonly images: CollectionImagesService,
    private readonly collections: CollectionsService,
  ) {}

  /** Copies a guest photo's original into the collection image; the frame itself is untouched. */
  @Post('from-frame')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: collectionSchema })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: not the owner’s collection, or no such live frame in it',
  })
  @ApiResponse({
    status: 409,
    description:
      'COLLECTION_ARCHIVED, QUOTA_EXCEEDED (the copy does not fit the collection or the account)',
  })
  @ApiResponse({
    status: 422,
    description: 'COVER_SOURCE_INVALID: not a photo, no original, or its processing failed',
  })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  async fromFrame(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: setCoverFromFrameRequestSchema }) body: SetCoverFromFrameRequest,
  ): Promise<Collection> {
    await this.images.setFromFrame(principal, params.id, COLLECTION_IMAGE, body.contentItemId);
    return this.collections.read(principal, params.id);
  }

  /** Removes the collection image (the initials tile shows again). Idempotent. */
  @Delete()
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Removed (or there was none)' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not the owner’s collection' })
  @ApiResponse({ status: 409, description: 'COLLECTION_ARCHIVED' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  remove(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
  ): Promise<void> {
    return this.images.remove(principal, params.id, COLLECTION_IMAGE);
  }

  /** Opens an upload (photos only); the same `clientUploadId` and file returns the open one. */
  @Post('uploads')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: uploadSessionResponseSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: not the owner’s collection' })
  @ApiResponse({
    status: 409,
    description:
      'COLLECTION_ARCHIVED (no changes while archived), QUOTA_EXCEEDED (collection or account full), IDEMPOTENCY_CONFLICT (clientUploadId used for another file), UPLOAD_CLOSED',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED (a retry of an expired upload)' })
  @ApiResponse({
    status: 422,
    description: 'FILE_TYPE_NOT_ALLOWED (a photo only), FILE_TOO_LARGE',
  })
  @ApiResponse({
    status: 429,
    description: `${RATE_LIMITED}, or more than 3 collection image uploads open in this collection`,
  })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  initiate(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: createUploadRequestSchema }) body: CreateUploadRequest,
  ): Promise<UploadSessionResponse> {
    return this.uploads.initiate(principal, params.id, COLLECTION_IMAGE, body);
  }

  @Post('uploads/:uploadId/parts')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: uploadPartsResponseSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: parts beyond partCount' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no such collection image upload of this owner',
  })
  @ApiResponse({ status: 409, description: 'UPLOAD_CLOSED, UPLOAD_IN_PROGRESS (retryable)' })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  parts(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: coverUploadParamsSchema }) params: CoverUploadParams,
    @Body({ schema: uploadPartsRequestSchema }) body: UploadPartsRequest,
  ): Promise<UploadPartsResponse> {
    return this.uploads.presignParts(
      principal,
      params.id,
      COLLECTION_IMAGE,
      params.uploadId,
      body.partNumbers,
    );
  }

  /**
   * Verifies the upload and makes it the collection image (replacing the current one). Answers
   * the collection, with `image.status = PENDING` until the worker made the thumbnail. A repeat
   * returns the collection as it is now.
   */
  @Post('uploads/:uploadId/complete')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: collectionSchema })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no such collection image upload of this owner',
  })
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
  async complete(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: coverUploadParamsSchema }) params: CoverUploadParams,
  ): Promise<Collection> {
    await this.uploads.complete(principal, params.id, params.uploadId, COLLECTION_IMAGE);
    return this.collections.read(principal, params.id);
  }

  /** Idempotent; allowed while archived (it only frees space). */
  @Delete('uploads/:uploadId')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Cancelled (or already cancelled)' })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND: no such collection image upload of this owner',
  })
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
    return this.uploads.cancel(principal, params.id, COLLECTION_IMAGE, params.uploadId);
  }
}
