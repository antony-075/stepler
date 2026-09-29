import {
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { AppError, type IssueList } from './app-error.js';

type Issues = Parameters<NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>>[0];

function toIssueList(issues: Issues): IssueList {
  return issues.map((issue) => ({
    path: (issue.path ?? []).map((segment) => {
      const key = typeof segment === 'object' ? segment.key : segment;
      return typeof key === 'number' ? key : String(key);
    }),
    message: issue.message,
  }));
}

/** Validates `@Body/@Query/@Param({ schema })` with Zod (Standard Schema), NestJS 12 built-in. */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new AppError('VALIDATION_FAILED', 400, { errors: toIssueList(issues) }),
  });
}
