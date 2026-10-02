import { Global, Module } from '@nestjs/common';
import { LimitsService } from './limits.service.js';
import { UsageService } from './usage.service.js';

@Global()
@Module({ providers: [LimitsService, UsageService], exports: [LimitsService, UsageService] })
export class LimitsModule {}
