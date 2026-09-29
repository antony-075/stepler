import { z } from 'zod';

/** Response of `GET /api/v1/health/live`: the process is up. Readiness (DB/storage) is separate. */
export const healthLiveResponseSchema = z.object({ status: z.literal('ok') }).strict();

export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;

const checkStatusSchema = z.enum(['ok', 'fail']);

/** Response of `GET /api/v1/health/ready`: dependencies the API needs to serve requests. */
export const healthReadyResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.object({ database: checkStatusSchema, storage: checkStatusSchema }).strict(),
  })
  .strict();

export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>;
