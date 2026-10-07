import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { REDACTED, redactUrl } from './redact.js';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

type RequestWithId = IncomingMessage & { id?: unknown };

/**
 * Reuses a well-formed incoming request id (from the web proxy or an edge), else a new UUID,
 * and echoes it. `configureApp` calls this before body parsing, so parser errors carry it too;
 * pino-http then reuses the same id.
 */
export function assignRequestId(req: RequestWithId, res: ServerResponse): string {
  if (typeof req.id === 'string') return req.id;
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

interface SerializedRequest {
  url?: string;
  query?: unknown;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

function httpOptions(env: Pick<ApiEnv, 'LOG_LEVEL'>, pretty: boolean): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: assignRequestId,
    // Header values are credentials; request bodies are never logged.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        // Untrusted when invalid; the effective id is logged as `req.id`.
        'req.headers["x-request-id"]',
        'res.headers["set-cookie"]',
        // Billing (ADR 0018): never a key or a signed payload, even if one reached a log object.
        '*.LIQPAY_PRIVATE_KEY',
        '*.privateKey',
        '*.signature',
      ],
      censor: REDACTED,
    },
    serializers: {
      req: (req: SerializedRequest) => {
        // `query` would repeat the raw token/code values; the redacted URL carries the rest.
        const serialized: SerializedRequest = { ...req };
        delete serialized.query;
        if (serialized.url !== undefined) serialized.url = redactUrl(serialized.url);
        // The verify page's URL carries the magic-link token; browsers may send it as Referer.
        const referer = serialized.headers?.referer;
        if (typeof referer === 'string') {
          serialized.headers = { ...serialized.headers, referer: redactUrl(referer) };
        }
        return serialized;
      },
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  };
}

@Module({})
export class LoggingModule {
  /** `destination` replaces stdout; tests pass a capture stream. */
  static forRoot(destination?: DestinationStream): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [API_ENV],
          useFactory: (env: Pick<ApiEnv, 'LOG_LEVEL' | 'NODE_ENV'>) => {
            const pretty = env.NODE_ENV === 'development' && destination === undefined;
            const options = httpOptions(env, pretty);
            return { pinoHttp: destination === undefined ? options : [options, destination] };
          },
        }),
      ],
    };
  }
}
