import { z } from 'zod';

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Names the invalid variables only; values may contain secrets and are never included. */
export class EnvValidationError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadApiEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(names);
  }
  return result.data;
}
