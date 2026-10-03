import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { ApiEnv } from './env.js';

/** Injection token for the validated `ApiEnv`. */
export const API_ENV = Symbol('API_ENV');

@Global()
@Module({})
export class ConfigModule {
  /** The worker passes its own env, which shares the fields its providers read. */
  static forRoot(env: Pick<ApiEnv, 'NODE_ENV' | 'LOG_LEVEL' | 'DATABASE_URL'>): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
