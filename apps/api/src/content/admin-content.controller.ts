import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  adminContentDetailSchema,
  adminContentItemSchema,
  adminContentListQuerySchema,
  adminContentPageSchema,
  bulkDeleteContentRequestSchema,
  bulkDeleteContentResponseSchema,
  collectionIdParamsSchema,
  contentCountsSchema,
  contentIdParamsSchema,
  type AdminContentDetail,
  type AdminContentItem,
  type AdminContentListQuery,
  type AdminContentPage,
  type BulkDeleteContentRequest,
  type BulkDeleteContentResponse,
  type ContentCounts,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { AdminContentService } from './admin-content.service.js';

interface IdParams {
  id: string;
}

const NOT_FOUND = {
  status: 404,
  description: "NOT_FOUND: not the admin's, deleted, or the collection is being deleted",
} as const;

/** The signed-in admin's content, in their own collections only; anything else is 404. */
@ApiTags('Content')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ version: '1' })
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get('collections/:id/content')
  @ApiResponse({ status: 200, standardSchema: adminContentPageSchema })
  @ApiResponse(NOT_FOUND)
  list(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
    @Query({ schema: adminContentListQuerySchema }) query: AdminContentListQuery,
  ): Promise<AdminContentPage> {
    return this.content.list(principal, params.id, query);
  }

  @Get('collections/:id/content/counts')
  @ApiResponse({ status: 200, standardSchema: contentCountsSchema })
  @ApiResponse(NOT_FOUND)
  counts(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
  ): Promise<ContentCounts> {
    return this.content.counts(principal, params.id);
  }

  /** Deletes several frames at once (the admin's multi-select) [C7]; safe to retry. */
  @Post('collections/:id/content/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: bulkDeleteContentResponseSchema })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED: 1 to 100 unique UUIDs are required',
  })
  @ApiResponse(NOT_FOUND)
  bulkDelete(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: collectionIdParamsSchema }) params: IdParams,
    @Body({ schema: bulkDeleteContentRequestSchema }) body: BulkDeleteContentRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<BulkDeleteContentResponse> {
    return this.content.bulkDelete(principal, params.id, body.ids, requestId);
  }

  @Get('content/:id')
  @ApiResponse({ status: 200, standardSchema: adminContentDetailSchema })
  @ApiResponse(NOT_FOUND)
  get(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: contentIdParamsSchema }) params: IdParams,
  ): Promise<AdminContentDetail> {
    return this.content.get(principal, params.id);
  }

  /** «Приховати від гостей» (R3): idempotent; an operator-hidden frame stays as it is. */
  @Post('content/:id/hide')
  @ApiTags('Moderation')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: adminContentItemSchema })
  @ApiResponse(NOT_FOUND)
  hide(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: contentIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<AdminContentItem> {
    return this.content.hide(principal, params.id, requestId);
  }

  /** «Показати гостям»: only a frame the admin hid. Idempotent. */
  @Post('content/:id/unhide')
  @ApiTags('Moderation')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, standardSchema: adminContentItemSchema })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description: 'CONTENT_MODERATED: the Stepler operator hid it; the admin cannot show it',
  })
  unhide(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: contentIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<AdminContentItem> {
    return this.content.unhide(principal, params.id, requestId);
  }

  @Delete('content/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description: 'Deleted, or already deleted (idempotent); gone for everyone at once',
  })
  @ApiResponse(NOT_FOUND)
  delete(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: contentIdParamsSchema }) params: IdParams,
    @RequestId() requestId: string | undefined,
  ): Promise<void> {
    return this.content.delete(principal, params.id, requestId);
  }
}
