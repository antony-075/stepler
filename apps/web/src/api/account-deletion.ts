import {
  accountDeletedResponseSchema,
  accountDeletionPreviewResponseSchema,
  authEmailSentResponseSchema,
} from '@stepler/contracts';
import { apiRequest } from './client';

/** Mails the deletion link to the signed-in account (`POST /api/v1/me/deletion`, ADR 0020). */
export const requestAccountDeletion = () =>
  apiRequest('/me/deletion', { method: 'POST', schema: authEmailSentResponseSchema });

/** What the mailed link deletes; uses nothing up. */
export const previewAccountDeletion = (token: string) =>
  apiRequest('/auth/account-deletion/preview', {
    method: 'POST',
    body: { token },
    schema: accountDeletionPreviewResponseSchema,
  });

/** Deletes the account; the session cookie is cleared. */
export const confirmAccountDeletion = (token: string) =>
  apiRequest('/auth/account-deletion/confirm', {
    method: 'POST',
    body: { token },
    schema: accountDeletedResponseSchema,
  });
