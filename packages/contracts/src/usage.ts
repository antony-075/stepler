import { z } from 'zod';

/** `GET /api/v1/me/usage`. Storage usage is added in a later slice (additive). */
export const usageResponseSchema = z
  .object({
    activeCollections: z
      .object({ used: z.number().int().min(0), limit: z.number().int().min(0) })
      .strict(),
  })
  .strict();
export type UsageResponse = z.infer<typeof usageResponseSchema>;
