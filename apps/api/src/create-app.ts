import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module.js';
import type { ApiEnv } from './config/env.js';

export interface CreateAppOptions {
  /** Replaces stdout for logs; used by tests to capture output. */
  logDestination?: DestinationStream;
}

export async function createApp(
  env: ApiEnv,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({ env, logDestination: options.logDestination }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.API_TRUST_PROXY);
  app.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // API responses are never sniffed as another type or cached by browsers and proxies.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  return app;
}
