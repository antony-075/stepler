import type { ServerResponse } from 'node:http';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  healthLiveResponseSchema,
  healthReadyResponseSchema,
  type HealthLiveResponse,
  type HealthReadyResponse,
} from '@stepler/contracts';
import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Public()
@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness only: the process is up. The container HEALTHCHECK uses this. */
  @Get('live')
  @ApiResponse({ status: 200, standardSchema: healthLiveResponseSchema })
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  /** Readiness: the database and object storage answer. 503 when any check fails. */
  @Get('ready')
  @ApiResponse({ status: 200, standardSchema: healthReadyResponseSchema })
  @ApiResponse({
    status: 503,
    description: 'A dependency failed',
    standardSchema: healthReadyResponseSchema,
  })
  async ready(@Res({ passthrough: true }) res: ServerResponse): Promise<HealthReadyResponse> {
    const result = await this.health.readiness();
    if (result.status !== 'ok') res.statusCode = HttpStatus.SERVICE_UNAVAILABLE;
    return result;
  }
}
