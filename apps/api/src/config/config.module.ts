import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { ApiEnv } from './env.js';

/** Injection token for the validated `ApiEnv`. */
export const API_ENV = Symbol('API_ENV');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
