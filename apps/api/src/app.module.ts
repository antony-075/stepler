import { type DynamicModule, Module } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { ErrorsModule } from './errors/errors.module.js';
import { GuestAccessModule } from './guest-access/guest-access.module.js';
import { HealthModule } from './health/health.module.js';
import { LimitsModule } from './limits/limits.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { MailModule } from './mail/mail.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TurnstileModule } from './turnstile/turnstile.module.js';
import { UsersModule } from './users/users.module.js';

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
        ErrorsModule,
        DatabaseModule,
        StorageModule,
        MailModule,
        TurnstileModule,
        LimitsModule,
        AuditModule,
        AuthModule,
        UsersModule,
        CollectionsModule,
        GuestAccessModule,
        HealthModule,
      ],
    };
  }
}
