import { type DynamicModule, Module } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { LimitsModule } from './limits/limits.module.js';
import { LoggingModule } from './logging/logging.module.js';

export interface AppModuleOptions {
  env: ApiEnv;
  logDestination?: DestinationStream;
}

@Module({})
export class AppModule {
  static forRoot({ env, logDestination }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggingModule.forRoot(logDestination),
        LimitsModule,
        HealthModule,
      ],
    };
  }
}
