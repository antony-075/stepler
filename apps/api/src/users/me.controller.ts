import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  meResponseSchema,
  updateMeRequestSchema,
  type MeResponse,
  type UpdateMeRequest,
} from '@stepler/contracts';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/principal.js';
import { SESSION_COOKIE_SCHEME } from '../openapi/openapi.js';
import { UsersService } from './users.service.js';

@ApiTags('Me')
@ApiCookieAuth(SESSION_COOKIE_SCHEME)
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiResponse({ status: 200, standardSchema: meResponseSchema })
  me(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return this.users.me(principal);
  }

  @Patch()
  @ApiResponse({ status: 200, standardSchema: meResponseSchema })
  update(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: updateMeRequestSchema }) body: UpdateMeRequest,
  ): Promise<MeResponse> {
    return this.users.updateMe(principal, body);
  }
}
