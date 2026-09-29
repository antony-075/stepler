import { z } from 'zod';

/** Response of `GET /api/v1/health/live`: the process is up. Readiness (DB/storage) is separate. */
export const healthLiveResponseSchema = z.object({ status: z.literal('ok') }).strict();

export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;
