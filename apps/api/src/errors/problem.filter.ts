import { STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ErrorCode, ProblemDetails } from '@stepler/contracts';
import { redactUrl } from '../logging/redact.js';
import { AppError } from './app-error.js';
import { ERROR_REPORTER, type ErrorReporter } from './error-reporter.js';

/** Codes for framework `HttpException`s (routing, body parsing, throttling). */
const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

type RequestWithId = IncomingMessage & { id?: unknown };

/** Name and message only: causes from HTTP clients never include request bodies or secrets. */
function describeCause(cause: unknown): string | undefined {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return cause === undefined ? undefined : 'non-error cause';
}

/**
 * The 4xx status of framework errors: Nest `HttpException`s, and body-parser errors (malformed
 * JSON, payload too large), which are plain errors with `status` and a string `type`.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  if (exception instanceof Error && 'status' in exception && 'type' in exception) {
    const { status, type } = exception as { status: unknown; type: unknown };
    if (typeof status === 'number' && status >= 400 && status < 500 && typeof type === 'string') {
      return status;
    }
  }
  return undefined;
}

/**
 * Renders every error as RFC 9457 problem+json. Unexpected errors become a generic 500 and
 * are reported; their message never reaches the client.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<ServerResponse>();
    const requestId = typeof req.id === 'string' ? req.id : undefined;
    const problem = this.toProblem(exception, requestId);

    if (problem.code === 'INTERNAL') {
      this.reporter.capture(exception, { requestId, path: redactUrl(req.url ?? '') });
    } else if (exception instanceof AppError && exception.status >= 500) {
      // Expected dependency failures (e.g. DEPENDENCY_UNAVAILABLE) stay diagnosable (rule 13).
      this.logger.warn({
        msg: 'Dependency failure',
        code: exception.code,
        requestId,
        cause: describeCause(exception.cause),
      });
    }
    if (res.headersSent) return;
    res.statusCode = problem.status;
    if (exception instanceof AppError && exception.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }
    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    res.end(JSON.stringify(problem));
  }

  private toProblem(exception: unknown, requestId: string | undefined): ProblemDetails {
    const base = (status: number, code: ErrorCode, retryable: boolean): ProblemDetails => ({
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      code,
      retryable,
      ...(requestId === undefined ? {} : { requestId }),
    });

    if (exception instanceof AppError) {
      return {
        ...base(exception.status, exception.code, exception.retryable),
        ...(exception.detail === undefined ? {} : { detail: exception.detail }),
        ...(exception.errors === undefined ? {} : { errors: exception.errors }),
      };
    }
    const status = clientErrorStatus(exception);
    if (status !== undefined) {
      const code = CODE_BY_STATUS[status];
      if (code !== undefined) return base(status, code, status === 429);
    }
    return base(500, 'INTERNAL', false);
  }
}
