import { Global, Module } from '@nestjs/common';
import { LimitsService } from './limits.service.js';
import { RateLimitStore } from './rate-limit-store.js';
import { UsageService } from './usage.service.js';

@Global()
@Module({
  providers: [LimitsService, UsageService, RateLimitStore],
  exports: [LimitsService, UsageService, RateLimitStore],
})
export class LimitsModule {}
