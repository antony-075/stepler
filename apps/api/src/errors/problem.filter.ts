import { STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
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

/**
 * Renders every error as RFC 9457 problem+json. Unexpected errors become a generic 500 and
 * are reported; their message never reaches the client.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<ServerResponse>();
    const requestId = typeof req.id === 'string' ? req.id : undefined;
    const problem = this.toProblem(exception, requestId);

    if (problem.code === 'INTERNAL') {
      this.reporter.capture(exception, { requestId, path: redactUrl(req.url ?? '') });
    }
    if (res.headersSent) return;
    res.statusCode = problem.status;
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
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status];
      if (code !== undefined) return base(status, code, status === 429);
    }
    return base(500, 'INTERNAL', false);
  }
}
