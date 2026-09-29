import type { Server } from 'node:http';
import { Body, Controller, Get, HttpException, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type ProblemDetails, problemDetailsSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/create-app.js';
import { AppError } from '../src/errors/app-error.js';
import { ERROR_REPORTER, type ErrorReporter } from '../src/errors/error-reporter.js';
import { testEnv } from './support/env.js';

const createThingSchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

@Controller({ path: 'test-errors', version: '1' })
class TestErrorsController {
  @Post('things')
  create(@Body({ schema: createThingSchema }) body: z.infer<typeof createThingSchema>): object {
    return body;
  }

  @Get('app-error')
  appError(): never {
    throw new AppError('ACCOUNT_BLOCKED', 403, { detail: 'Account is blocked' });
  }

  @Get('crash')
  crash(): never {
    throw new Error('db password=hunter2 at host');
  }

  @Get('throttled')
  throttled(): never {
    throw new HttpException('Too Many Requests', 429);
  }
}

class RecordingReporter implements ErrorReporter {
  calls: unknown[] = [];
  capture(error: unknown): void {
    this.calls.push(error);
  }
}

describe('problem+json errors', () => {
  let app: INestApplication;
  const reporter = new RecordingReporter();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ env: testEnv() })],
      controllers: [TestErrorsController],
    })
      .overrideProvider(ERROR_REPORTER)
      .useValue(reporter)
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app, testEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reporter.calls = [];
  });

  function expectProblem(res: request.Response, status: number, code: string): ProblemDetails {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = problemDetailsSchema.parse(res.body);
    expect(body.code).toBe(code);
    expect(body.status).toBe(status);
    expect(body.requestId).toBe(res.headers['x-request-id']);
    return body;
  }

  test('body validation → 400 VALIDATION_FAILED with issue paths', async () => {
    const res = await request(server()).post('/api/v1/test-errors/things').send({ name: '' });
    expect(expectProblem(res, 400, 'VALIDATION_FAILED').errors?.[0]?.path).toEqual(['name']);
  });

  test('nested issue paths keep array indexes', async () => {
    const res = await request(server())
      .post('/api/v1/test-errors/things')
      .send({ name: 'a', tags: ['ok', 5] });
    expect(expectProblem(res, 400, 'VALIDATION_FAILED').errors?.[0]?.path).toEqual(['tags', 1]);
  });

  test('malformed JSON → 400 VALIDATION_FAILED', async () => {
    const res = await request(server())
      .post('/api/v1/test-errors/things')
      .set('content-type', 'application/json')
      .send('{"name":');
    expectProblem(res, 400, 'VALIDATION_FAILED');
  });

  test('unknown route → 404 NOT_FOUND', async () => {
    expectProblem(await request(server()).get('/api/v1/nope'), 404, 'NOT_FOUND');
  });

  test('AppError keeps its code, status and detail', async () => {
    const res = await request(server()).get('/api/v1/test-errors/app-error');
    const body = expectProblem(res, 403, 'ACCOUNT_BLOCKED');
    expect(body.detail).toBe('Account is blocked');
    expect(body.retryable).toBe(false);
  });

  test('429 → RATE_LIMITED, retryable', async () => {
    const res = await request(server()).get('/api/v1/test-errors/throttled');
    expect(expectProblem(res, 429, 'RATE_LIMITED').retryable).toBe(true);
  });

  test('unexpected error → generic 500 INTERNAL, reported once, no internals leaked', async () => {
    const res = await request(server()).get('/api/v1/test-errors/crash');
    const body = expectProblem(res, 500, 'INTERNAL');
    expect(JSON.stringify(body)).not.toMatch(/password|hunter2/);
    expect(body.detail).toBeUndefined();
    expect(reporter.calls).toHaveLength(1);
  });

  test('expected errors are not reported', async () => {
    await request(server()).get('/api/v1/test-errors/app-error');
    await request(server()).get('/api/v1/nope');
    expect(reporter.calls).toHaveLength(0);
  });
});
