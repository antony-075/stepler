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

/** Reuses a well-formed incoming request id (from the web proxy or an edge), else a new UUID. */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

interface SerializedRequest {
  url?: string;
  query?: unknown;
  [key: string]: unknown;
}

function httpOptions(env: ApiEnv, pretty: boolean): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: requestId,
    // Header values are credentials; request bodies are never logged.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        // Untrusted when invalid; the effective id is logged as `req.id`.
        'req.headers["x-request-id"]',
        'res.headers["set-cookie"]',
      ],
      censor: REDACTED,
    },
    serializers: {
      req: (req: SerializedRequest) => {
        // `query` would repeat the raw token/code values; the redacted URL carries the rest.
        const serialized: SerializedRequest = { ...req };
        delete serialized.query;
        if (serialized.url !== undefined) serialized.url = redactUrl(serialized.url);
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
          useFactory: (env: ApiEnv) => {
            const pretty = env.NODE_ENV === 'development' && destination === undefined;
            const options = httpOptions(env, pretty);
            return { pinoHttp: destination === undefined ? options : [options, destination] };
          },
        }),
      ],
    };
  }
}
