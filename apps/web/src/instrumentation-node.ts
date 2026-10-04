import { LEGAL_DOCUMENTS } from '@stepler/contracts';
import { getWebEnv } from './env';
import { assertLegalReady } from './legal/readiness';

/**
 * Exit on invalid configuration instead of serving 500s. The legal readiness check ([C20]) runs
 * here too: `next dev` always allows drafts, every built server needs `LEGAL_ALLOW_DRAFT=true`
 * until the real texts and contact are published, and production never sets it.
 */
export function validateEnvOrExit(): void {
  try {
    const env = getWebEnv();
    assertLegalReady({
      documents: LEGAL_DOCUMENTS,
      allowDraft: env.LEGAL_ALLOW_DRAFT || process.env.NODE_ENV === 'development',
      contactEmail: env.LEGAL_CONTACT_EMAIL,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid environment'}\n`);
    process.exit(1);
  }
}
