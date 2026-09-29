import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ERROR_REPORTER, LoggingErrorReporter } from './error-reporter.js';
import { ProblemFilter } from './problem.filter.js';

@Global()
@Module({
  providers: [
    { provide: ERROR_REPORTER, useClass: LoggingErrorReporter },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
  exports: [ERROR_REPORTER],
})
export class ErrorsModule {}
