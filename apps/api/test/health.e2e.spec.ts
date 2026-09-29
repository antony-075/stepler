import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthLiveResponseSchema, healthReadyResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { ApiEnv } from '../src/config/env.js';
import { configureApp, createApp } from '../src/create-app.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { testEnv } from './support/env.js';

const server = (app: INestApplication): Server => app.getHttpServer() as Server;

async function appWith(env: ApiEnv, storage?: Partial<ObjectStorage>): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot({ env })] });
  if (storage !== undefined) builder = builder.overrideProvider(OBJECT_STORAGE).useValue(storage);
  const app = (await builder.compile()).createNestApplication({ bufferLogs: true });
  configureApp(app, env);
  await app.init();
  return app;
}

describe('health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(testEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test('GET /api/v1/health/live returns contract-valid body', async () => {
    const res = await request(server(app)).get('/api/v1/health/live').expect(200);
    expect(healthLiveResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  test('unversioned path is not served', async () => {
    await request(server(app)).get('/api/health/live').expect(404);
  });

  test('GET /api/v1/health/ready with real services → 200 ok', async () => {
    const res = await request(server(app)).get('/api/v1/health/ready').expect(200);
    expect(healthReadyResponseSchema.parse(res.body)).toEqual({
      status: 'ok',
      checks: { database: 'ok', storage: 'ok' },
    });
  });
});

describe('health readiness failures', () => {
  test('failing storage → 503 degraded with storage: fail', async () => {
    const app = await appWith(testEnv(), {
      checkHealth: () => Promise.reject(new Error('bucket unreachable')),
    });
    const res = await request(server(app)).get('/api/v1/health/ready').expect(503);
    expect(healthReadyResponseSchema.parse(res.body)).toEqual({
      status: 'degraded',
      checks: { database: 'ok', storage: 'fail' },
    });
    await app.close();
  });

  test('storage that never answers fails within the check timeout', async () => {
    const app = await appWith(testEnv(), { checkHealth: () => new Promise(() => undefined) });
    const started = Date.now();
    const res = await request(server(app)).get('/api/v1/health/ready').expect(503);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(res.body).toMatchObject({ checks: { storage: 'fail' } });
    await app.close();
  });

  test('unreachable database → 503 degraded with database: fail', async () => {
    const app = await appWith(
      testEnv({ DATABASE_URL: 'postgresql://stepler:x@127.0.0.1:1/stepler_test' }),
    );
    const res = await request(server(app)).get('/api/v1/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'degraded', checks: { database: 'fail', storage: 'ok' } });
    await app.close();
  });
});
