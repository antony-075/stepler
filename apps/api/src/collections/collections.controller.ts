import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  collectionIdParamsSchema,
  collectionListResponseSchema,
  collectionSchema,
  createCollectionRequestSchema,
  listCollectionsQuerySchema,
  updateCollectionRequestSchema,
  type Collection,
  type CollectionListResponse,
  type CreateCollectionRequest,
  type ListCollectionsQuery,
  type UpdateCollectionRequest,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/principal.js';
import { RequestId } from '../logging/request-id.decorator.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { CollectionsService } from './collections.service.js';

interface CollectionIdParams {
  id: string;
}

/** The signed-in admin's own collections; anything else is 404. */
@ApiTags('Collections')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'collections', version: '1' })
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @ApiResponse({ status: 200, standardSchema: collectionListResponseSchema })
  list(
    @CurrentPrincipal() principal: Principal,
    @Query({ schema: listCollectionsQuerySchema }) query: ListCollectionsQuery,
  ): Promise<CollectionListResponse> {
    return this.collections.list(principal, query);
  }

  @Post()
  @ApiResponse({ status: 201, standardSchema: collectionSchema })
  @ApiResponse({
    status: 409,
    description: 'COLLECTION_LIMIT_REACHED: the active limit is reached',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED: daily creation cap; see Retry-After' })
  create(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: createCollectionRequestSchema }) body: CreateCollectionRequest,
    @RequestId() requestId: string | undefined,
  ): Promise<Collection> {
    return this.collections.create(principal, body, requestId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, standardSchema: collectionSchema })
  get(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
  ): Promise<Collection> {
    return this.collections.get(principal, params.id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, standardSchema: collectionSchema })
  update(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: collectionIdParamsSchema }) params: CollectionIdParams,
    @Body({ schema: updateCollectionRequestSchema }) body: UpdateCollectionRequest,
  ): Promise<Collection> {
    return this.collections.update(principal, params.id, body);
  }
}
