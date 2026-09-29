import { z } from 'zod';

const webEnvSchema = z.object({
  API_INTERNAL_URL: z.url(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/** Names the invalid variables only; values may contain secrets and are never included. */
export function loadWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = webEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  return result.data;
}
