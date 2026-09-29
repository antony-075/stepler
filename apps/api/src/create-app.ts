import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module.js';
import type { ApiEnv } from './config/env.js';
import { createValidationPipe } from './errors/validation.js';
import { assignRequestId } from './logging/logging.module.js';
import { buildOpenApiDocument } from './openapi/openapi.js';

export interface CreateAppOptions {
  /** Replaces stdout for logs; used by tests to capture output. */
  logDestination?: DestinationStream;
}

/** Applies the HTTP setup shared by `main` and tests that build their own testing module. */
export function configureApp(app: INestApplication, env: ApiEnv): void {
  const express = app as NestExpressApplication;
  express.useLogger(express.get(Logger));
  express.set('trust proxy', env.API_TRUST_PROXY);
  // Registered before Nest's body parser (added at init), so it also covers parser errors.
  express.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    assignRequestId(req, res);
    // API responses are never sniffed as another type or cached by browsers and proxies.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  express.setGlobalPrefix('api');
  express.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  express.useGlobalPipes(createValidationPipe());
  express.enableShutdownHooks();
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', express, () => buildOpenApiDocument(express));
  }
}

export async function createApp(
  env: ApiEnv,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({ env, logDestination: options.logDestination }),
    { bufferLogs: true },
  );
  configureApp(app, env);
  return app;
}
