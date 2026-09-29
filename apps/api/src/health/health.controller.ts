import { Controller, Get } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { healthLiveResponseSchema, type HealthLiveResponse } from '@stepler/contracts';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  /** Liveness only: the process is up. Readiness (DB, storage) is added in Phase 2. */
  @Get('live')
  @ApiResponse({ status: 200, standardSchema: healthLiveResponseSchema })
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }
}
