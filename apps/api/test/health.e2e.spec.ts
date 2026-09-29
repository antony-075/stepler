import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { healthLiveResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';

describe('health', () => {
  let app: INestApplication;
  // Nest types the HTTP server as `any`.
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp({ NODE_ENV: 'test', API_PORT: 0, LOG_LEVEL: 'error' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  test('GET /api/v1/health/live returns contract-valid body', async () => {
    const res = await request(server()).get('/api/v1/health/live').expect(200);
    expect(healthLiveResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  test('unversioned path is not served', async () => {
    await request(server()).get('/api/health/live').expect(404);
  });
});
