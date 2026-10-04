import type { LegalDocumentVersion } from '@stepler/contracts';

/**
 * The production gate for the legal texts ([C20], owner decision L4): a built server refuses to
 * start while a current document is still a draft or the contact e-mail is unset, unless drafts
 * are explicitly allowed (`LEGAL_ALLOW_DRAFT=true`: development, CI, staging; never production).
 * Every problem is listed in one message so the operator fixes them in one go.
 */
export function assertLegalReady(input: {
  documents: readonly LegalDocumentVersion[];
  allowDraft: boolean;
  contactEmail: string | undefined;
}): void {
  if (input.allowDraft) return;
  const problems = input.documents
    .filter((entry) => entry.draft)
    .map((entry) => `${entry.document} ${entry.version} is a draft`);
  if (input.contactEmail === undefined) problems.push('LEGAL_CONTACT_EMAIL is not set');
  if (problems.length > 0) {
    throw new Error(
      `Legal documents are not ready for production (set LEGAL_ALLOW_DRAFT=true outside production): ${problems.join('; ')}`,
    );
  }
}
