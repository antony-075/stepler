import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  adminContentDetailSchema,
  adminContentListQuerySchema,
  adminContentPageSchema,
  collectionIdParamsSchema,
  contentCountsSchema,
  contentIdParamsSchema,
  type AdminContentDetail,
  type AdminContentListQuery,
  type AdminContentPage,
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

  @Get('content/:id')
  @ApiResponse({ status: 200, standardSchema: adminContentDetailSchema })
  @ApiResponse(NOT_FOUND)
  get(
    @CurrentPrincipal() principal: AccountPrincipal,
    @Param({ schema: contentIdParamsSchema }) params: IdParams,
  ): Promise<AdminContentDetail> {
    return this.content.get(principal, params.id);
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
