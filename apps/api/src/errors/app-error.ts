import type { ErrorCode, ProblemDetails } from '@stepler/contracts';

export type IssueList = NonNullable<ProblemDetails['errors']>;

export interface AppErrorOptions {
  /** Safe, non-localized detail for developers; never include secrets or personal data. */
  detail?: string;
  retryable?: boolean;
  errors?: IssueList;
  /** RFC 9457 extension members, e.g. `missingPartNumbers`. Never secrets or personal data. */
  extensions?: Record<string, unknown>;
  /** Sets `Retry-After` on the response (seconds). */
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** An expected failure with a stable code; rendered as problem+json by `ProblemFilter`. */
export class AppError extends Error {
  readonly detail: string | undefined;
  readonly retryable: boolean;
  readonly errors: IssueList | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly extensions: Record<string, unknown> | undefined;

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    options: AppErrorOptions = {},
  ) {
    super(options.detail ?? code, { cause: options.cause });
    this.name = 'AppError';
    this.detail = options.detail;
    this.retryable = options.retryable ?? false;
    this.errors = options.errors;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.extensions = options.extensions;
  }
}
