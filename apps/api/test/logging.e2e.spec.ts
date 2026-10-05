import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { listenOnLoopback } from './support/app.js';
import { testEnv } from './support/env.js';

/** Collects everything pino writes so tests can assert on the raw log output. */
class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

describe('request logging', () => {
  let app: INestApplication;
  const logs = new CaptureStream();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LOG_LEVEL: 'info' }), { logDestination: logs });
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logs.output = '';
  });

  test('logs the request id but never cookies or token query values', async () => {
    const res = await request(server())
      .get('/api/v1/health/live?token=tok123&code=abc999')
      .set('Cookie', 'st_session=secret-cookie-value')
      .set('Authorization', 'Bearer secret-bearer')
      .expect(200);
    const requestId = res.headers['x-request-id'];
    expect(requestId).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
    expect(logs.output).toContain(requestId);
    for (const secret of ['secret-cookie-value', 'secret-bearer', 'tok123', 'abc999']) {
      expect(logs.output).not.toContain(secret);
    }
  });

  test('never logs a token carried in the Referer header', async () => {
    const res = await request(server())
      .get('/api/v1/health/live')
      .set('Referer', 'http://localhost:3000/auth/verify?token=referer-token-1')
      .expect(200);
    expect(logs.output).toContain(res.headers['x-request-id']);
    expect(logs.output).not.toContain('referer-token-1');
  });

  test('echoes a valid incoming x-request-id', async () => {
    const res = await request(server())
      .get('/api/v1/health/live')
      .set('x-request-id', 'abcd1234')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('abcd1234');
  });

  test('replaces an invalid incoming x-request-id', async () => {
    const res = await request(server())
      .get('/api/v1/health/live')
      .set('x-request-id', '<script>')
      .expect(200);
    expect(res.headers['x-request-id']).not.toBe('<script>');
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
    expect(logs.output).toContain(res.headers['x-request-id']);
    expect(logs.output).not.toContain('<script>');
  });

  test('sets nosniff and no-store on API responses', async () => {
    const res = await request(server()).get('/api/v1/health/live').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
