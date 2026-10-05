import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  collectionIdParamsSchema,
  createUploadRequestSchema,
  guestPageEditorSchema,
  guestPageImageParamsSchema,
  guestPageImageUploadParamsSchema,
  publishGuestPageRequestSchema,
  saveGuestPageDraftRequestSchema,
  setCoverFromFrameRequestSchema,
  uploadPartsRequestSchema,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
  type CreateUploadRequest,
  type GuestPageEditor,
  type PublishGuestPageRequest,
  type SaveGuestPageDraftRequest,
  type SetCoverFromFrameRequest,
  type UploadPartsRequest,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import type { z } from 'zod';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.js';
import { CollectionImagesService, type ImageTarget } from '../images/collection-images.service.js';
import { ImageUploadsService } from '../images/image-uploads.service.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import type { PageImageSlot } from './guest-page.repository.js';
import { GuestPageService } from './guest-page.service.js';

type CollectionIdParams = z.infer<typeof collectionIdParamsSchema>;
type ImageParams = z.infer<typeof guestPageImageParamsSchema>;
type ImageUploadParams = z.infer<typeof guestPageImageUploadParamsSchema>;

const SLOT: Record<ImageParams['slot'], PageImageSlot> = {
  cover: 'COVER',
  background: 'BACKGROUND',
};
const draftTarget = (slot: ImageParams['slot']): ImageTarget => ({
  slot: SLOT[slot],
  version: 'DRAFT',
});

const NOT_FOUND = 'NOT_FOUND: not the owner’s collection (another owner’s, or being deleted)';
const RATE_LIMITED = 'RATE_LIMITED: calls per IP or per user (see Retry-After)';

/**
 * The guest page editor (plan Task 9, ADR 0017), owner only under the admin session: anything
 * that is not the principal's own live collection is `404`. Unsafe methods keep the CSRF origin
 * check. Guests read only the published version, inside their context; nothing here is reachable
 * with a guest cookie (`401`). An archived collection can be read but not changed
 * (`409 COLLECTION_ARCHIVED`, [A6]). Draft images reuse the admin image upload flow; changing
 * one never bumps the draft's revision.
 */
@ApiTags('Guest page')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@UseGuards(RateLimitGuard)
@Controller({ path: 'collections/:id/guest-page', version: '1' })
export class GuestPageController {
  constructor(
    private readonly pages: GuestPageService,
    private readonly images: CollectionImagesService,
    private readonly uploads: ImageUploadsService,
  ) {}

  /** The published version and the draft (with its revision) as the owner sees them. */
  @Get()
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  read(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
  ): Promise<GuestPageEditor> {
    return this.pages.read(principal, params.id);
  }

  /** Saves the working copy (template, settings, welcome); creates the draft if there is none. */
  @Put('draft')
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_FAILED: unknown template (path templateId) or settings the template does not allow (paths under settings)',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'GUEST_PAGE_DRAFT_CONFLICT: baseRevision is not the current draft revision (changed in another tab); COLLECTION_ARCHIVED',
  })
  @ApiResponse({ status: 422, description: 'THEME_CONTRAST_TOO_LOW: a broken template definition' })
  saveDraft(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: saveGuestPageDraftRequestSchema }) body: SaveGuestPageDraftRequest,
  ): Promise<GuestPageEditor> {
    return this.pages.saveDraft(principal, params.id, body);
  }

  /** «Скинути зміни»: deletes the draft and its unused images. Idempotent. */
  @Delete('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Deleted (or there was none)' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'COLLECTION_ARCHIVED' })
  reset(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
  ): Promise<void> {
    return this.pages.reset(principal, params.id);
  }

  /** «Зберегти»: guests see the draft from now on. No draft: `200` as is. */
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: 'GUEST_PAGE_DRAFT_CONFLICT: not the current draft revision; COLLECTION_ARCHIVED',
  })
  publish(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: publishGuestPageRequestSchema }) body: PublishGuestPageRequest,
  ): Promise<GuestPageEditor> {
    return this.pages.publish(principal, params.id, body.revision);
  }

  /** Copies a guest photo's original into the draft's cover or background. */
  @Post('draft/:slot/from-frame')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({ status: 404, description: `${NOT_FOUND}, or no such live frame in it` })
  @ApiResponse({ status: 409, description: 'COLLECTION_ARCHIVED, QUOTA_EXCEEDED' })
  @ApiResponse({
    status: 422,
    description: 'COVER_SOURCE_INVALID: not a photo, no original, or its processing failed',
  })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  async fromFrame(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestPageImageParamsSchema }) params: ImageParams,
    @Body({ schema: setCoverFromFrameRequestSchema }) body: SetCoverFromFrameRequest,
  ): Promise<GuestPageEditor> {
    await this.images.setFromFrame(
      principal,
      params.id,
      draftTarget(params.slot),
      body.contentItemId,
    );
    return this.pages.read(principal, params.id);
  }

  /** Removes the draft's cover or background (the published one is untouched). */
  @Delete('draft/:slot')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'COLLECTION_ARCHIVED' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  async removeImage(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestPageImageParamsSchema }) params: ImageParams,
  ): Promise<GuestPageEditor> {
    await this.images.remove(principal, params.id, draftTarget(params.slot));
    return this.pages.read(principal, params.id);
  }

  /** Opens an upload for the draft's cover or background (photos only); idempotent per file. */
  @Post('draft/:slot/uploads')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, standardSchema: uploadSessionResponseSchema })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'COLLECTION_ARCHIVED, QUOTA_EXCEEDED (collection or account full), IDEMPOTENCY_CONFLICT, UPLOAD_CLOSED',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED' })
  @ApiResponse({ status: 422, description: 'FILE_TYPE_NOT_ALLOWED (a photo only), FILE_TOO_LARGE' })
  @ApiResponse({
    status: 429,
    description: `${RATE_LIMITED}, or more than 3 uploads of this slot open in this collection`,
  })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  initiate(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestPageImageParamsSchema }) params: ImageParams,
    @Body({ schema: createUploadRequestSchema }) body: CreateUploadRequest,
  ): Promise<UploadSessionResponse> {
    return this.uploads.initiate(principal, params.id, draftTarget(params.slot), body);
  }

  @Post('draft/:slot/uploads/:uploadId/parts')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: uploadPartsResponseSchema })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED: parts beyond partCount' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such upload of this owner and slot' })
  @ApiResponse({
    status: 409,
    description: 'UPLOAD_CLOSED, UPLOAD_IN_PROGRESS (retryable), COLLECTION_ARCHIVED',
  })
  @ApiResponse({ status: 410, description: 'UPLOAD_EXPIRED' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  @ApiResponse({ status: 503, description: 'DEPENDENCY_UNAVAILABLE: storage; retryable' })
  parts(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestPageImageUploadParamsSchema }) params: ImageUploadParams,
    @Body({ schema: uploadPartsRequestSchema }) body: UploadPartsRequest,
  ): Promise<UploadPartsResponse> {
    return this.uploads.presignParts(
      principal,
      params.id,
      draftTarget(params.slot),
      params.uploadId,
      body.partNumbers,
    );
  }

  /** Verifies the upload and makes it the draft's image (creating the draft if absent). */
  @Post('draft/:slot/uploads/:uploadId/complete')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: guestPageEditorSchema })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such upload of this owner and slot' })
  @ApiResponse({
    status: 409,
    description:
      'UPLOAD_INCOMPLETE (with missingPartNumbers), UPLOAD_IN_PROGRESS (retryable), UPLOAD_CLOSED, COLLECTION_ARCHIVED',
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
    @Param({ schema: guestPageImageUploadParamsSchema }) params: ImageUploadParams,
  ): Promise<GuestPageEditor> {
    await this.uploads.complete(principal, params.id, params.uploadId, draftTarget(params.slot));
    return this.pages.read(principal, params.id);
  }

  /** Idempotent; allowed while archived (it only frees space). */
  @Delete('draft/:slot/uploads/:uploadId')
  @RateLimit('admin-cover', 'admin-cover-user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Cancelled (or already cancelled)' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: no such upload of this owner and slot' })
  @ApiResponse({ status: 409, description: 'UPLOAD_CLOSED; UPLOAD_IN_PROGRESS (retryable)' })
  @ApiResponse({ status: 429, description: RATE_LIMITED })
  cancel(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: guestPageImageUploadParamsSchema }) params: ImageUploadParams,
  ): Promise<void> {
    return this.uploads.cancel(principal, params.id, draftTarget(params.slot), params.uploadId);
  }
}
