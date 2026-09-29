import 'reflect-metadata';
import { type INestApplication, type LogLevel, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { ApiEnv } from './config/env.js';

const NEST_LOG_LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
const LEVEL_INDEX: Record<ApiEnv['LOG_LEVEL'], number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export async function createApp(env: ApiEnv): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: NEST_LOG_LEVELS.slice(0, LEVEL_INDEX[env.LOG_LEVEL] + 1),
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  return app;
}
