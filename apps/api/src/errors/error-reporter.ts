import { Injectable, Logger } from '@nestjs/common';

export interface ErrorContext {
  requestId?: string;
  path?: string;
}

/** Port for unexpected errors. The monitoring provider is an open decision (spec §21). */
export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void;
}

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

/** The only adapter until a monitoring provider is chosen: logs at `error` with the stack. */
@Injectable()
export class LoggingErrorReporter implements ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  capture(error: unknown, context: ErrorContext): void {
    // `err` goes through pino's error serializer (type, message, stack).
    this.logger.error({ msg: 'Unhandled error', err: error, ...context });
  }
}
